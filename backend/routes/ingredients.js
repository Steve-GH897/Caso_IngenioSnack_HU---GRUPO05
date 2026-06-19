const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');

// Helper para actualizar la disponibilidad de los productos basado en sus recetas e insumos
async function checkAndUpdateProductAvailability(client, io) {
  const productsRes = await client.query('SELECT product_code, name, available FROM products');
  for (const product of productsRes.rows) {
    const code = product.product_code;
    const recipeRes = await client.query(
      `SELECT r.qty_required, i.stock 
       FROM recipes r
       JOIN ingredients i ON r.ingredient_id = i.id
       WHERE r.product_code = $1`,
      [code]
    );

    let isAvailable = true;
    if (recipeRes.rows.length > 0) {
      for (const item of recipeRes.rows) {
        if (parseInt(item.stock) < parseInt(item.qty_required)) {
          isAvailable = false;
          break;
        }
      }
    }

    if (isAvailable !== product.available) {
      await client.query('UPDATE products SET available = $1 WHERE product_code = $2', [isAvailable, code]);
      if (io) {
        io.emit('product_availability_changed', { productCode: code, available: isAvailable });
      }
    }
  }
}

// GET /api/ingredients (Admin - listar todos los insumos)
router.get('/', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ingredients ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /ingredients]', err);
    res.status(500).json({ error: 'Error al obtener insumos.' });
  }
});

// POST /api/ingredients (Admin - crear nuevo insumo)
router.post('/', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { name, stock, unit, lowStockThreshold } = req.body;
    if (!name || stock === undefined) {
      return res.status(400).json({ error: 'Datos incompletos.' });
    }
    const result = await pool.query(
      `INSERT INTO ingredients (name, stock, unit, low_stock_threshold)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, parseInt(stock), unit || 'unidades', parseInt(lowStockThreshold || 5)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[POST /ingredients]', err);
    res.status(500).json({ error: 'Error al crear insumo.' });
  }
});

// PATCH /api/ingredients/:id/stock (Admin - recargar/actualizar stock)
router.patch('/:id/stock', authenticateToken, authorizeAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { qty } = req.body; // qty a añadir al stock
    if (qty === undefined || isNaN(qty)) {
      return res.status(400).json({ error: 'Cantidad inválida.' });
    }

    await client.query('BEGIN');
    const updateRes = await client.query(
      `UPDATE ingredients
       SET stock = stock + $1
       WHERE id = $2
       RETURNING *`,
      [parseInt(qty), id]
    );

    if (updateRes.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Insumo no encontrado.' });
    }

    const updatedIngredient = updateRes.rows[0];
    const io = req.app.get('io');
    
    // Recalcular disponibilidad de productos
    await checkAndUpdateProductAvailability(client, io);
    await client.query('COMMIT');

    res.json(updatedIngredient);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PATCH /ingredients/:id/stock]', err);
    res.status(500).json({ error: 'Error al actualizar stock del insumo.' });
  } finally {
    client.release();
  }
});

// GET /api/ingredients/recipes (Admin - listar recetas de todos los productos)
router.get('/recipes', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.product_code, p.name as product_name, p.emoji as product_emoji,
              COALESCE(
                json_agg(
                  json_build_object(
                    'recipeId', r.id,
                    'ingredientId', r.ingredient_id,
                    'ingredientName', i.name,
                    'ingredientUnit', i.unit,
                    'qtyRequired', r.qty_required
                  ) ORDER BY i.name
                ) FILTER (WHERE r.id IS NOT NULL),
                '[]'
              ) as recipe_items
       FROM products p
       LEFT JOIN recipes r ON p.product_code = r.product_code
       LEFT JOIN ingredients i ON r.ingredient_id = i.id
       GROUP BY p.product_code, p.name, p.emoji
       ORDER BY p.name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /recipes]', err);
    res.status(500).json({ error: 'Error al obtener recetas.' });
  }
});

// PUT /api/ingredients/recipes/:productCode (Admin - actualizar receta de un producto)
router.put('/recipes/:productCode', authenticateToken, authorizeAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { productCode } = req.params;
    const { recipeItems } = req.body; // Array de { ingredientId, qtyRequired }

    if (!Array.isArray(recipeItems)) {
      return res.status(400).json({ error: 'Formato de receta inválido.' });
    }

    await client.query('BEGIN');

    // 1. Eliminar receta previa
    await client.query('DELETE FROM recipes WHERE product_code = $1', [productCode]);

    // 2. Insertar nuevos items de la receta
    for (const item of recipeItems) {
      if (item.ingredientId && item.qtyRequired > 0) {
        await client.query(
          `INSERT INTO recipes (product_code, ingredient_id, qty_required)
           VALUES ($1, $2, $3)`,
          [productCode, item.ingredientId, parseInt(item.qtyRequired)]
        );
      }
    }

    const io = req.app.get('io');
    // 3. Recalcular disponibilidad del producto de inmediato
    await checkAndUpdateProductAvailability(client, io);
    await client.query('COMMIT');

    // Retornar la nueva receta armada
    const finalRecipe = await pool.query(
      `SELECT r.id as recipe_id, r.ingredient_id, i.name as ingredient_name, i.unit as ingredient_unit, r.qty_required
       FROM recipes r
       JOIN ingredients i ON r.ingredient_id = i.id
       WHERE r.product_code = $1`,
      [productCode]
    );

    res.json({ productCode, recipeItems: finalRecipe.rows });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PUT /recipes/:productCode]', err);
    res.status(500).json({ error: 'Error al guardar la receta.' });
  } finally {
    client.release();
  }
});

module.exports = {
  router,
  checkAndUpdateProductAvailability
};
