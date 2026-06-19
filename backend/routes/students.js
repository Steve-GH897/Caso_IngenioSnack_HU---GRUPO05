/**
 * IngenioSnack — Rutas de Estudiantes
 * GET /api/students/:codigo         → Datos del estudiante
 * GET /api/students/:codigo/loyalty → Sellos y cupones (RF-06)
 * GET /api/students                 → Lista para admin
 */
const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const { authenticateToken, authorizeAdmin } = require('../middleware/auth');

function mapStudent(s) {
  return {
    id:            s.id,
    codigo:        s.codigo,
    name:          s.name,
    isAdmin:       s.is_admin,
    walletBalance: parseFloat(s.wallet_balance || 0),
    points:        parseFloat(s.points || 0),
    totalSpent:    parseFloat(s.total_spent || 0),
  };
}

// Mapeo seguro para el administrador (Oculta el código/email)
function mapStudentForAdmin(s) {
  return {
    id:            s.id,
    name:          s.name,
    isAdmin:       s.is_admin,
    walletBalance: parseFloat(s.wallet_balance || 0),
    points:        parseFloat(s.points || 0),
    totalSpent:    parseFloat(s.total_spent || 0),
  };
}

// GET /api/students — Lista todos (para admin)
router.get('/', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM students ORDER BY created_at DESC'
    );
    res.json(result.rows.map(mapStudentForAdmin));
  } catch (err) {
    console.error('[GET /students]', err);
    res.status(500).json({ error: 'Error al obtener estudiantes.' });
  }
});

// GET /api/students/:codigo
router.get('/:codigo', authenticateToken, async (req, res) => {
  try {
    const { codigo } = req.params;
    const result = await pool.query(
      'SELECT * FROM students WHERE LOWER(codigo) = LOWER($1)',
      [codigo]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Estudiante no encontrado.' });
    }
    res.json(mapStudent(result.rows[0]));
  } catch (err) {
    console.error('[GET /students/:codigo]', err);
    res.status(500).json({ error: 'Error al obtener estudiante.' });
  }
});

// PATCH /api/students/id/:id/recharge — Para admin
router.patch('/id/:id/recharge', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount } = req.body;
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Monto de recarga inválido.' });
    }

    const result = await pool.query(
      `UPDATE students 
       SET wallet_balance = COALESCE(wallet_balance, 0) + $1 
       WHERE id = $2 
       RETURNING *`,
      [amount, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Estudiante no encontrado.' });
    }

    const updatedStudent = mapStudent(result.rows[0]);

    // Emitir evento por socket
    const io = req.app.get('io');
    if (io) {
      io.to(`room_student_${updatedStudent.id}`).emit('wallet_updated', {
        walletBalance: updatedStudent.walletBalance,
        points: updatedStudent.points
      });
    }

    res.json({ message: 'Saldo recargado exitosamente.', student: updatedStudent });
  } catch (err) {
    console.error('[PATCH /students/:codigo/recharge]', err);
    res.status(500).json({ error: 'Error al recargar saldo.' });
  }
});

// PATCH /api/students/id/:id/unblock — Para admin (desbloquear estudiante)
router.patch('/id/:id/unblock', authenticateToken, authorizeAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      `UPDATE students 
       SET blocked = FALSE, strikes = 0
       WHERE id = $1 
       RETURNING *`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Estudiante no encontrado.' });
    }
    res.json({ message: 'Estudiante desbloqueado.', student: mapStudent(result.rows[0]) });
  } catch (err) {
    console.error('[PATCH /students/:id/unblock]', err);
    res.status(500).json({ error: 'Error al desbloquear estudiante.' });
  }
});

module.exports = router;
