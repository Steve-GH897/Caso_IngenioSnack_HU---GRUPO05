/**
 * IngenioSnack — Rutas de Productos
 * GET  /api/products
 * PATCH /api/products/:code/toggle
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');

/**
 * GET /api/products
 * Devuelve todos los productos.
 * Query param: ?category=sandwiches|bebidas|snacks
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { category } = req.query;
    let query = 'SELECT * FROM products ORDER BY id';
    let params = [];

    if (category && category !== 'todos') {
      query = 'SELECT * FROM products WHERE category = $1 ORDER BY id';
      params = [category];
    }

    const result = await pool.query(query, params);
    res.json(result.rows.map(mapProduct));
  } catch (err) {
    console.error('[GET /products]', err);
    res.status(500).json({ error: 'Error al obtener productos.' });
  }
});

/**
 * PATCH /api/products/:code/toggle
 * RF-03: Alterna disponibilidad del producto con un clic.
 */
router.patch('/:code/toggle', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { code } = req.params;
    const result = await pool.query(
      `UPDATE products
       SET available = NOT available
       WHERE product_code = $1
       RETURNING *`,
      [code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    res.json(mapProduct(result.rows[0]));
  } catch (err) {
    console.error(`[PATCH /products/${req.params.code}/toggle]`, err);
    res.status(500).json({ error: 'Error al cambiar estado del producto.' });
  }
});

// ──────────
//  PATCH /api/products/:code/stars
// ──────────
router.patch('/:code/stars', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { code } = req.params;
    const { stars } = req.body;
    
    if (stars === undefined || isNaN(stars) || stars < 0) {
      return res.status(400).json({ error: 'Estrellas inválidas.' });
    }

    const result = await pool.query(
      `UPDATE products
       SET stars_reward = $1
       WHERE product_code = $2
       RETURNING *`,
      [stars, code]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' });
    }

    res.json(mapProduct(result.rows[0]));
  } catch (err) {
    console.error(`[PATCH /products/${req.params.code}/stars]`, err);
    res.status(500).json({ error: 'Error al actualizar las estrellas.' });
  }
});

function mapProduct(p) {
  return {
    id:             p.id,
    productCode:    p.product_code,
    name:           p.name,
    category:       p.category,
    price:          parseFloat(p.price),
    emoji:          p.emoji,
    available:      p.available,
    countsSandwich: p.counts_sandwich,
    starsReward:    p.stars_reward || 0,
    description:    p.description  || null,
    imageUrl:       p.image_url    || null,
  };
}

module.exports = router;
