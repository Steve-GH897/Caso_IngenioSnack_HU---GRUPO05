/**
 * IngenioSnack — Rutas de Pedidos
 * POST   /api/orders            → Crear pedido (RF-01)
 * GET    /api/orders            → Listar todos (admin)
 * GET    /api/orders/ready      → Pedidos listos (pantalla pública)
 * GET    /api/orders/analytics  → Top-3 analítica (RF-07)
 * GET    /api/orders/history    → Historial filtrado (admin)
 * GET    /api/orders/student/:codigo
 * PATCH  /api/orders/:id/status → Cambiar estado (admin)
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');
const { checkAndUpdateProductAvailability } = require('./ingredients');

// ─────────────────────────────────────────────
//  Helper: formatear pedido de la BD al frontend
// ─────────────────────────────────────────────
function mapOrder(o) {
  return {
    id:            o.id,
    orderCode:     o.order_code,
    studentCodigo: o.student_codigo,
    studentName:   o.student_name,
    total:         parseFloat(o.total),
    status:        o.status,
    orderDate:     o.order_date,
    createdAt:     o.created_at,
    items:         o.items || [],
  };
}

// ─────────────────────────────────────────────
//  GET /api/orders/history  (Admin — historial filtrado)
//  Query params: ?status=delivered&student=e_...&from=2026-01-01&to=2026-12-31
// ─────────────────────────────────────────────
router.get('/history', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { status, student, from, to } = req.query;
    const conditions = [];
    const params     = [];
    let   idx        = 1;

    if (status && status !== 'all') {
      conditions.push(`o.status = $${idx++}`);
      params.push(status);
    }
    if (student) {
      conditions.push(`LOWER(o.student_codigo) LIKE $${idx++}`);
      params.push(`%${student.toLowerCase()}%`);
    }
    if (from) {
      conditions.push(`o.order_date >= $${idx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`o.order_date <= $${idx++}`);
      params.push(to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const result = await pool.query(
      `SELECT o.*, json_agg(
        json_build_object(
          'productCode', oi.product_code,
          'name', oi.name,
          'emoji', oi.emoji,
          'qty', oi.qty,
          'unitPrice', oi.unit_price,
          'subtotal', oi.subtotal
        ) ORDER BY oi.id
      ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      ${where}
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 150`,
      params
    );

    res.json(result.rows.map(mapOrder));
  } catch (err) {
    console.error('[GET /orders/history]', err);
    res.status(500).json({ error: 'Error al obtener historial de pedidos.' });
  }
});


// ─────────────────────────────────────────────
//  GET /api/orders/ready  (Pantalla Pública - Problema B)
//  IMPORTANTE: esta ruta debe ir ANTES de /:id
// ─────────────────────────────────────────────
router.get('/ready', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, json_agg(
        json_build_object(
          'productCode', oi.product_code,
          'name', oi.name,
          'emoji', oi.emoji,
          'qty', oi.qty,
          'unitPrice', oi.unit_price,
          'subtotal', oi.subtotal
        ) ORDER BY oi.id
      ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE o.status = 'ready'
      GROUP BY o.id
      ORDER BY o.created_at ASC`
    );
    res.json(result.rows.map(mapOrder));
  } catch (err) {
    console.error('[GET /orders/ready]', err);
    res.status(500).json({ error: 'Error al obtener pedidos listos.' });
  }
});

// ─────────────────────────────────────────────
//  GET /api/orders/analytics  (RF-07 + Filtro fechas)
// ─────────────────────────────────────────────
router.get('/analytics', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { from, to } = req.query;

    // BUG-03 fix: validar que from <= to
    if (from && to && new Date(from) > new Date(to)) {
      return res.status(400).json({
        error: 'La fecha de inicio no puede ser mayor que la fecha final.'
      });
    }

    const fromDate = from || new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
    const toDate   = to   || new Date().toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT
        oi.product_code,
        oi.name,
        oi.emoji,
        SUM(oi.qty) AS total_qty,
        SUM(oi.subtotal) AS total_revenue
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.status = 'delivered'
        AND o.order_date BETWEEN $1 AND $2
      GROUP BY oi.product_code, oi.name, oi.emoji
      ORDER BY total_qty DESC
      LIMIT 3`,
      [fromDate, toDate]
    );

    // Contar pedidos en el período
    const countResult = await pool.query(
      `SELECT COUNT(*) AS total
       FROM orders
       WHERE status = 'delivered'
         AND order_date BETWEEN $1 AND $2`,
      [fromDate, toDate]
    );

    res.json({
      from: fromDate,
      to:   toDate,
      totalDelivered: parseInt(countResult.rows[0].total),
      ranking: result.rows.map((r, i) => ({
        rank:        i + 1,
        productCode: r.product_code,
        name:        r.name,
        emoji:       r.emoji,
        count:       parseInt(r.total_qty),
        revenue:     parseFloat(r.total_revenue),
      })),
    });
  } catch (err) {
    console.error('[GET /orders/analytics]', err);
    res.status(500).json({ error: 'Error al obtener analítica.' });
  }
});

// ─────────────────────────────────────────────
//  GET /api/orders  (Admin — todos los pedidos)
// ─────────────────────────────────────────────
router.get('/', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT o.*, json_agg(
        json_build_object(
          'productCode', oi.product_code,
          'name', oi.name,
          'emoji', oi.emoji,
          'qty', oi.qty,
          'unitPrice', oi.unit_price,
          'subtotal', oi.subtotal
        ) ORDER BY oi.id
      ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      GROUP BY o.id
      ORDER BY o.created_at DESC`
    );
    res.json(result.rows.map(mapOrder));
  } catch (err) {
    console.error('[GET /orders]', err);
    res.status(500).json({ error: 'Error al obtener pedidos.' });
  }
});

// ─────────────────────────────────────────────
//  GET /api/orders/student/:codigo
// ─────────────────────────────────────────────
router.get('/student/:codigo', authenticateToken, async (req, res) => {
  try {
    const { codigo } = req.params;
    const result = await pool.query(
      `SELECT o.*, json_agg(
        json_build_object(
          'productCode', oi.product_code,
          'name', oi.name,
          'emoji', oi.emoji,
          'qty', oi.qty,
          'unitPrice', oi.unit_price,
          'subtotal', oi.subtotal
        ) ORDER BY oi.id
      ) AS items
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      WHERE LOWER(o.student_codigo) = LOWER($1)
      GROUP BY o.id
      ORDER BY o.created_at DESC
      LIMIT 10`,
      [codigo]
    );
    res.json(result.rows.map(mapOrder));
  } catch (err) {
    console.error('[GET /orders/student/:codigo]', err);
    res.status(500).json({ error: 'Error al obtener pedidos del estudiante.' });
  }
});

// ─────────────────────────────────────────────
//  POST /api/orders  (RF-01 + Problema D + RF-06)
// ─────────────────────────────────────────────
router.post('/', authenticateToken, async (req, res) => {
  const client = await pool.connect(); // Transacción
  try {
    const { studentCodigo, items } = req.body;

    if (!studentCodigo || !items || items.length === 0) {
      return res.status(400).json({ error: 'Datos de pedido incompletos.' });
    }

    await client.query('BEGIN');

    // Verificar estudiante (insensible a mayúsculas/minúsculas)
    const studentResult = await client.query(
      'SELECT * FROM students WHERE LOWER(codigo) = LOWER($1) FOR UPDATE',
      [studentCodigo]
    );
    const student = studentResult.rows[0];
    if (!student) return res.status(404).json({ error: 'Estudiante no encontrado.' });

    // MEJORA: Límite de 1 pedido activo por estudiante
    const activeOrderCheck = await client.query(
      `SELECT order_code FROM orders WHERE LOWER(student_codigo) = LOWER($1) AND status IN ('pending','preparing','ready')`,
      [studentCodigo]
    );
    if (activeOrderCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'active_order',
        message: `Ya tienes el pedido ${activeOrderCheck.rows[0].order_code} activo. Espera a que sea entregado antes de hacer uno nuevo.`,
      });
    }

    // PROBLEMA D: Verificar disponibilidad en el momento exacto de confirmar
    const productCodes = items.map(i => i.productCode);
    const productsResult = await client.query(
      'SELECT product_code, name, emoji, available, price, counts_sandwich FROM products WHERE product_code = ANY($1) FOR SHARE',
      [productCodes]
    );
    const productsMap = {};
    productsResult.rows.forEach(p => { productsMap[p.product_code] = p; });

    const oosItems = items.filter(i => {
      const p = productsMap[i.productCode];
      return !p || !p.available;
    });

    if (oosItems.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        error: 'out_of_stock',
        message: 'Uno o más productos se agotaron justo antes de confirmar.',
        oosProducts: oosItems.map(i => ({
          productCode: i.productCode,
          name: productsMap[i.productCode]?.name || i.name,
          emoji: productsMap[i.productCode]?.emoji || '',
        })),
      });
    }

    // === VALIDAR STOCK DE INSUMOS DE COCINA ===
    const ingredientRequirements = {};
    for (const item of items) {
      const recipeRes = await client.query(
        'SELECT ingredient_id, qty_required FROM recipes WHERE product_code = $1',
        [item.productCode]
      );
      for (const recipe of recipeRes.rows) {
        const ingId = recipe.ingredient_id;
        const totalNeeded = recipe.qty_required * item.qty;
        ingredientRequirements[ingId] = (ingredientRequirements[ingId] || 0) + totalNeeded;
      }
    }

    const ingredientIds = Object.keys(ingredientRequirements);
    if (ingredientIds.length > 0) {
      const ingredientsResult = await client.query(
        'SELECT id, name, stock FROM ingredients WHERE id = ANY($1) FOR UPDATE',
        [ingredientIds]
      );
      const ingredientsMap = {};
      ingredientsResult.rows.forEach(ing => { ingredientsMap[ing.id] = ing; });

      const missingIngredients = [];
      for (const ingId of ingredientIds) {
        const required = ingredientRequirements[ingId];
        const availableStock = ingredientsMap[ingId]?.stock || 0;
        if (availableStock < required) {
          missingIngredients.push({
            name: ingredientsMap[ingId]?.name || 'Insumo desconocido',
            required,
            available: availableStock
          });
        }
      }

      if (missingIngredients.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'insufficient_ingredients',
          message: 'No hay suficientes insumos en cocina para preparar este pedido.',
          details: missingIngredients
        });
      }
    }

    // Calcular total y construir items
    let total = 0;
    let earnedStars = 0;
    let coffeeItem = null;
    const orderItems = items.map(i => {
      const p = productsMap[i.productCode];
      const unitPrice = parseFloat(p.price);
      if (p.product_code === 'p05' && !coffeeItem) {
        coffeeItem = i; // p05 es el Café Americano
      }
      const subtotal  = unitPrice * i.qty;
      total += subtotal;
      earnedStars += (p.stars_reward || 0) * i.qty;
      return { ...i, unitPrice, subtotal, countsSandwich: p.counts_sandwich };
    });

    // Fidelización: Café gratis si tiene >= 50 puntos
    let pointsDeducted = 0;
    let couponEarned = false; // Usaremos esto para indicar si se APLICÓ el descuento
    if (parseFloat(student.points || 0) >= 50 && coffeeItem) {
      const coffeePrice = parseFloat(productsMap[coffeeItem.productCode].price);
      total -= coffeePrice;
      const itemRef = orderItems.find(x => x.productCode === coffeeItem.productCode);
      itemRef.subtotal -= coffeePrice;
      pointsDeducted = 50;
      couponEarned = true;
    }

    // Verificar Saldo Prepago
    if (parseFloat(student.wallet_balance || 0) < total) {
      await client.query('ROLLBACK');
      return res.status(402).json({
        error: 'insufficient_funds',
        message: 'Saldo prepago insuficiente para realizar el pedido.'
      });
    }

    // Generar código único de pedido
    const counterResult = await client.query(
      `SELECT COALESCE(MAX(CAST(SUBSTRING(order_code FROM 2) AS INT)), 42) + 1 AS next_num FROM orders`
    );
    const nextNum  = counterResult.rows[0].next_num;
    const orderCode = '#' + String(nextNum).padStart(3, '0');

    // Insertar pedido
    const orderResult = await client.query(
      `INSERT INTO orders (order_code, student_codigo, student_name, total, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING *`,
      [orderCode, student.codigo, student.name, total.toFixed(2)]
    );
    const newOrder = orderResult.rows[0];

    // Insertar ítems
    for (const item of orderItems) {
      await client.query(
        `INSERT INTO order_items (order_id, product_code, name, emoji, qty, unit_price, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [newOrder.id, item.productCode, item.name, item.emoji, item.qty, item.unitPrice, item.subtotal]
      );
    }

    // Actualizar Billetera y Puntos (Estrellas)
    const newWallet = parseFloat(student.wallet_balance || 0) - total;
    const newTotalSpent = parseFloat(student.total_spent || 0) + total;
    const newPoints = parseFloat(student.points || 0) - pointsDeducted + earnedStars; // Gana estrellas según el producto

    await client.query(
      `UPDATE students
       SET wallet_balance = $1, total_spent = $2, points = $3
       WHERE codigo = $4`,
      [newWallet, newTotalSpent, newPoints, student.codigo]
    );

    await client.query('COMMIT');

    const mappedOrder = mapOrder({ ...newOrder, items: orderItems });

    // Emitir evento por socket al admin
    const io = req.app.get('io');
    if (io) {
      io.to('room_admin').emit('new_order', mappedOrder);
      
      // Actualizar billetera del estudiante si cambió
      io.to(`room_student_${student.id}`).emit('wallet_updated', {
        walletBalance: newWallet,
        points: newPoints
      });
    }

    res.status(201).json({
      order: mappedOrder,
      couponEarned, // true = se descontó 1 café
      newPoints,
      walletBalance: newWallet
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[POST /orders]', err);
    res.status(500).json({ error: 'Error al crear el pedido.' });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────
//  PATCH /api/orders/:id/status  (Admin)
//  Problema A: sistema de strikes
//  Problema B: actualizar pantalla pública
// ─────────────────────────────────────────────
router.patch('/:id/status', authenticateToken, authorizeAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id }       = req.params;
    const { newStatus } = req.body;

    const validStatuses = ['pending', 'preparing', 'ready', 'delivered', 'noshow', 'cancelled'];
    if (!validStatuses.includes(newStatus)) {
      return res.status(400).json({ error: 'Estado inválido.' });
    }

    await client.query('BEGIN');

    const orderResult = await client.query(
      'SELECT * FROM orders WHERE id = $1 FOR UPDATE',
      [id]
    );
    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Pedido no encontrado.' });
    }

    const order = orderResult.rows[0];
    await client.query(
      'UPDATE orders SET status = $1 WHERE id = $2',
      [newStatus, id]
    );

    // === LÓGICA DE INVENTARIO DE INSUMOS ===
    // 1. Si pasa de pending a preparing: descontar insumos
    if (newStatus === 'preparing' && order.status === 'pending') {
      const itemsRes = await client.query('SELECT product_code, qty FROM order_items WHERE order_id = $1', [id]);
      for (const item of itemsRes.rows) {
        const recipeRes = await client.query(
          'SELECT ingredient_id, qty_required FROM recipes WHERE product_code = $1',
          [item.product_code]
        );
        for (const recipe of recipeRes.rows) {
          const qtyToDeduct = recipe.qty_required * item.qty;
          const updateRes = await client.query(
            `UPDATE ingredients
             SET stock = GREATEST(0, stock - $1)
             WHERE id = $2
             RETURNING *`,
            [qtyToDeduct, recipe.ingredient_id]
          );
          const updatedIng = updateRes.rows[0];
          
          if (updatedIng && updatedIng.stock <= updatedIng.low_stock_threshold) {
            const io = req.app.get('io');
            if (io) {
              io.to('room_admin').emit('low_stock_alert', {
                ingredientId: updatedIng.id,
                name: updatedIng.name,
                stock: updatedIng.stock,
                unit: updatedIng.unit,
                threshold: updatedIng.low_stock_threshold
              });
            }
          }
        }
      }
      const io = req.app.get('io');
      await checkAndUpdateProductAvailability(client, io);
    }
    
    // 2. Si pasa a cancelled y antes estaba en preparing o ready: devolver insumos
    if (newStatus === 'cancelled' && (order.status === 'preparing' || order.status === 'ready')) {
      const itemsRes = await client.query('SELECT product_code, qty FROM order_items WHERE order_id = $1', [id]);
      for (const item of itemsRes.rows) {
        const recipeRes = await client.query(
          'SELECT ingredient_id, qty_required FROM recipes WHERE product_code = $1',
          [item.product_code]
        );
        for (const recipe of recipeRes.rows) {
          const qtyToRefund = recipe.qty_required * item.qty;
          await client.query(
            `UPDATE ingredients
             SET stock = stock + $1
             WHERE id = $2`,
            [qtyToRefund, recipe.ingredient_id]
          );
        }
      }
      const io = req.app.get('io');
      await checkAndUpdateProductAvailability(client, io);
    }

    let studentUpdate = null;

    // Si es cancelado, reembolsamos el saldo
    if (newStatus === 'cancelled') {
      const stuResult = await client.query(
        'SELECT * FROM students WHERE codigo = $1 FOR UPDATE',
        [order.student_codigo]
      );
      const student = stuResult.rows[0];
      if (student) {
        const orderTotal = parseFloat(order.total);
        
        // Calcular estrellas a revertir
        let starsToRevert = 0;
        const oiRes = await client.query('SELECT product_code, qty FROM order_items WHERE order_id = $1', [id]);
        for (const oi of oiRes.rows) {
          const pRes = await client.query('SELECT stars_reward FROM products WHERE product_code = $1', [oi.product_code]);
          if (pRes.rows.length > 0) {
            starsToRevert += (pRes.rows[0].stars_reward || 0) * oi.qty;
          }
        }

        await client.query(
          'UPDATE students SET wallet_balance = wallet_balance + $1, total_spent = GREATEST(0, total_spent - $1), points = GREATEST(0, points - $2) WHERE codigo = $3',
          [orderTotal, starsToRevert, student.codigo]
        );
        studentUpdate = student;
      }
    }

    await client.query('COMMIT');

    // Emitir eventos por socket
    const io = req.app.get('io');
    if (io) {
      // Al admin
      io.to('room_admin').emit('order_updated', { orderId: parseInt(id), newStatus });

      // Al estudiante (necesitamos el ID del estudiante, obtenemos del order)
      const stuIdResult = await pool.query('SELECT id FROM students WHERE codigo = $1', [order.student_codigo]);
      if (stuIdResult.rows.length > 0) {
        const studentId = stuIdResult.rows[0].id;
        io.to(`room_student_${studentId}`).emit('order_updated', { orderId: parseInt(id), newStatus });
        
        // Si fue cancelado, el saldo cambió
        if (newStatus === 'cancelled' && studentUpdate) {
          const newStuState = await pool.query('SELECT wallet_balance, points FROM students WHERE id = $1', [studentId]);
          io.to(`room_student_${studentId}`).emit('wallet_updated', {
            walletBalance: parseFloat(newStuState.rows[0].wallet_balance || 0),
            points: parseFloat(newStuState.rows[0].points || 0)
          });
        }
      }
    }

    res.json({
      orderId:       parseInt(id),
      orderCode:     order.order_code,
      newStatus,
      studentUpdate, // null si no hubo cambio de estudiante
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[PATCH /orders/:id/status]', err);
    res.status(500).json({ error: 'Error al actualizar estado.' });
  } finally {
    client.release();
  }
});

module.exports = router;
