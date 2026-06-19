/**
 * IngenioSnack — Rutas de Autenticación
 * POST /api/auth/login
 */
const express  = require('express');
const router   = express.Router();
const pool     = require('../db');
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const rateLimit = require('express-rate-limit');

// ── C3: Rate Limiting — máx. 10 intentos de login por IP cada 15 minutos ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.' },
  skipSuccessfulRequests: true, // Solo cuenta los intentos fallidos
});

/**
 * POST /api/auth/login
 * Body: { codigo: string, pin?: string }
 * - Si codigo === administrador@adm.com y pin correcto → rol admin
 * - Si codigo tiene formato UNCP → estudiante
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { codigo, pin } = req.body;

    if (!codigo || typeof codigo !== 'string') {
      return res.status(400).json({ error: 'Correo o código requerido.' });
    }

    let email = codigo.trim();
    // Auto-completar dominio de la UNCP si se ingresa solo el prefijo 'e_XXXXXXXXXXLetter'
    if (email.toLowerCase().startsWith('e_') && !email.includes('@')) {
      email += '@uncp.edu.pe';
    }
    const emailLower = email.toLowerCase();

    // 1. CONTROL DE ACCESO DE ADMINISTRADOR
    if (emailLower === 'administrador@adm.com') {
      // C2: Comparar con bcrypt en lugar de texto plano
      const pinHash = process.env.ADMIN_PIN_HASH;
      if (!pinHash || !pin) {
        return res.status(401).json({ error: 'Credenciales de administrador requeridas.' });
      }
      const pinValid = await bcrypt.compare(pin, pinHash);
      if (!pinValid) {
        return res.status(401).json({ error: 'Contraseña de administrador incorrecta.' });
      }
      let result = await pool.query(
        'SELECT * FROM students WHERE LOWER(codigo) = $1',
        [emailLower]
      );
      let admin = result.rows[0];
      if (!admin) {
        // Autocreación de administrador si no existiera en la DB
        const insertResult = await pool.query(
          `INSERT INTO students (codigo, name, is_admin) VALUES ($1, $2, TRUE) RETURNING *`,
          ['administrador@adm.com', 'Administrador']
        );
        admin = insertResult.rows[0];
      }
      const token = jwt.sign(
        { id: admin.id, codigo: admin.codigo, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '4h' }
      );

      return res.json({
        role: 'admin',
        student: mapStudent(admin),
        token
      });
    }

    // 2. CONTROL DE ACCESO DE ESTUDIANTES
    // Validar formato de correo: e_ + 9 o 10 números + 1 letra + @uncp.edu.pe o @uncp.edu.p
    const regex = /^e_\d{9,10}[a-z]@uncp\.edu\.pe?$/i;
    if (!regex.test(emailLower)) {
      return res.status(400).json({ error: 'Formato de correo institucional UNCP incorrecto. Estructura esperada: e_2024100333H@uncp.edu.pe' });
    }

    // Buscar estudiante en la BD de verificación
    let result = await pool.query(
      'SELECT * FROM students WHERE LOWER(codigo) = $1',
      [emailLower]
    );

    let student = result.rows[0];

    // Si no está registrado en la base de datos de verificación, denegar acceso
    if (!student) {
      return res.status(403).json({
        error: 'not_verified',
        message: 'Tu correo institucional no se encuentra en la base de datos de estudiantes autorizados.',
      });
    }

    // Verificar si está bloqueado
    if (student.blocked) {
      return res.status(403).json({
        error: 'blocked',
        message: 'Tu cuenta está bloqueada por pedidos no recogidos. Contacta a la administración.',
      });
    }

    // (Eliminado reset de stamps_today por reemplazo con puntos)

    const token = jwt.sign(
      { id: student.id, codigo: student.codigo, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }  // Reducido de 12h a 4h por seguridad
    );

    return res.json({
      role: 'student',
      student: mapStudent(student),
      token
    });

  } catch (err) {
    console.error('[POST /auth/login]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

function mapStudent(s) {
  return {
    id:             s.id,
    codigo:         s.codigo,
    name:           s.name,
    isAdmin:        s.is_admin,
    walletBalance:  parseFloat(s.wallet_balance || 0),
    points:         parseFloat(s.points || 0),
    totalSpent:     parseFloat(s.total_spent || 0),
  };
}

module.exports = router;
module.exports.mapStudent = mapStudent;
