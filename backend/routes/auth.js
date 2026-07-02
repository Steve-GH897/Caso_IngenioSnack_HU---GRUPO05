/**
 * IngenioSnack — Rutas de Autenticación
 * POST /api/auth/login      → Login administrador con correo UNCP + PIN
 * POST /api/auth/microsoft  → Autenticación OAuth 2.0 Microsoft 365 (real o simulada)
 * POST /api/auth/register   → Registro de nuevo estudiante tras validación de Microsoft
 */
const express   = require('express');
const router    = express.Router();
const pool      = require('../db');
const jwt       = require('jsonwebtoken');
const bcrypt    = require('bcryptjs');
const rateLimit = require('express-rate-limit');

// ── Rate Limiting — máx. 10 intentos por IP cada 15 minutos ──
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.' },
  skipSuccessfulRequests: true,
});

// ── Dirección del administrador (desde .env) ──
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'e_2024101433h@uncp.edu.pe').toLowerCase();

/**
 * POST /api/auth/login
 * Body: { codigo: string, pin: string }
 * Uso: Acceso de administrador con correo UNCP + contraseña
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { codigo, pin } = req.body;

    if (!codigo || typeof codigo !== 'string') {
      return res.status(400).json({ error: 'Correo o código requerido.' });
    }

    let email = codigo.trim();
    // Auto-completar dominio si se ingresa solo el prefijo
    if (email.toLowerCase().startsWith('e_') && !email.includes('@')) {
      email += '@uncp.edu.pe';
    }
    const emailLower = email.toLowerCase();

    // ── 1. ADMINISTRADOR ──
    if (emailLower === ADMIN_EMAIL) {
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
        const insertResult = await pool.query(
          `INSERT INTO students (codigo, name, is_admin, wallet_balance, points, total_spent)
           VALUES ($1, $2, TRUE, 0, 0, 0) RETURNING *`,
          [emailLower, 'Administrador FIS']
        );
        admin = insertResult.rows[0];
      } else if (!admin.is_admin) {
        // Asegurar que el correo admin tenga el rol correcto
        await pool.query('UPDATE students SET is_admin = TRUE WHERE id = $1', [admin.id]);
        admin.is_admin = true;
      }

      const token = jwt.sign(
        { id: admin.id, codigo: admin.codigo, role: 'admin' },
        process.env.JWT_SECRET,
        { expiresIn: '4h' }
      );
      return res.json({ role: 'admin', student: mapStudent(admin), token });
    }

    // ── 2. ESTUDIANTE (correo UNCP sin PIN) — solo para compatibilidad legacy ──
    const regex = /^e_\d{9,10}[a-z]@uncp\.edu\.pe?$/i;
    if (!regex.test(emailLower)) {
      return res.status(400).json({
        error: 'Formato de correo institucional UNCP incorrecto. Usa el botón "Ingresar con Microsoft" para estudiantes.',
      });
    }

    const result = await pool.query(
      'SELECT * FROM students WHERE LOWER(codigo) = $1',
      [emailLower]
    );
    const student = result.rows[0];

    if (!student) {
      return res.status(403).json({
        error: 'not_registered',
        message: 'Tu correo no está registrado. Usa la opción "Registrarse" para crear tu cuenta.',
      });
    }

    if (student.blocked) {
      return res.status(403).json({
        error: 'blocked',
        message: 'Tu cuenta está bloqueada. Contacta a la administración.',
      });
    }

    const token = jwt.sign(
      { id: student.id, codigo: student.codigo, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );
    return res.json({ role: 'student', student: mapStudent(student), token });

  } catch (err) {
    console.error('[POST /auth/login]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/auth/microsoft
 * Body: { accessToken, email, name, isMock }
 *
 * Flujo:
 *   1. Si isMock === true: usa email/name directamente (simulador local).
 *   2. Si isMock === false: valida accessToken con Microsoft Graph API.
 *   3. Verifica que el email termine en @uncp.edu.pe.
 *   4. Si el estudiante YA existe → devuelve JWT (inicio de sesión).
 *   5. Si el estudiante NO existe → devuelve { exists: false, email, name } para que
 *      el frontend muestre el modal de confirmación de registro.
 */
router.post('/microsoft', loginLimiter, async (req, res) => {
  try {
    const { accessToken, email: bodyEmail, name: bodyName, isMock } = req.body;

    let email, name;

    if (isMock) {
      // Simulador local: datos proporcionados directamente
      if (!bodyEmail || !bodyName) {
        return res.status(400).json({ error: 'Email y nombre requeridos en modo simulador.' });
      }
      email = bodyEmail.trim().toLowerCase();
      name  = bodyName.trim();
    } else {
      // Validación real contra Microsoft Graph
      if (!accessToken) {
        return res.status(400).json({ error: 'Access token de Microsoft requerido.' });
      }
      try {
        const graphRes = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!graphRes.ok) {
          return res.status(401).json({ error: 'Token de Microsoft inválido o expirado.' });
        }
        const profile = await graphRes.json();
        email = (profile.mail || profile.userPrincipalName || '').toLowerCase();
        name  = profile.displayName || profile.givenName || 'Estudiante';
      } catch (fetchErr) {
        console.error('[/auth/microsoft] Error consultando Graph API:', fetchErr);
        return res.status(502).json({ error: 'No se pudo verificar el token con Microsoft.' });
      }
    }

    // Validar dominio institucional
    if (!email.endsWith('@uncp.edu.pe') && !email.endsWith('@uncp.edu.p')) {
      return res.status(403).json({
        error: 'domain_invalid',
        message: 'Solo se permite el acceso con correo institucional (@uncp.edu.pe).',
      });
    }

    // Buscar estudiante en la BD
    const result = await pool.query(
      'SELECT * FROM students WHERE LOWER(codigo) = $1',
      [email]
    );
    const student = result.rows[0];

    if (!student) {
      // Primera vez: el estudiante no existe → frontend mostrará modal de registro
      return res.json({ exists: false, email, name });
    }

    if (student.blocked) {
      return res.status(403).json({
        error: 'blocked',
        message: 'Tu cuenta está bloqueada. Contacta a la administración.',
      });
    }

    // Estudiante existente → inicio de sesión directo
    const token = jwt.sign(
      { id: student.id, codigo: student.codigo, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );
    return res.json({ exists: true, role: 'student', student: mapStudent(student), token });

  } catch (err) {
    console.error('[POST /auth/microsoft]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

/**
 * POST /api/auth/register
 * Body: { email, name }
 * Registra un nuevo estudiante (correo UNCP) con saldo inicial S/ 0.00 y 0 estrellas.
 * Solo debe llamarse después de que /microsoft confirmó que el correo no existe en la BD.
 */
router.post('/register', loginLimiter, async (req, res) => {
  try {
    const { email: rawEmail, name: rawName } = req.body;

    if (!rawEmail || !rawName) {
      return res.status(400).json({ error: 'Email y nombre son requeridos.' });
    }

    const email = rawEmail.trim().toLowerCase();
    const name  = rawName.trim();

    // Validar dominio
    if (!email.endsWith('@uncp.edu.pe') && !email.endsWith('@uncp.edu.p')) {
      return res.status(403).json({ error: 'Solo se permite el registro con correo @uncp.edu.pe.' });
    }

    // Validar formato de correo UNCP (e_XXXXXXXXXXX@uncp.edu.pe)
    const regex = /^e_\d{9,10}[a-z]@uncp\.edu\.pe?$/i;
    if (!regex.test(email)) {
      return res.status(400).json({
        error: 'El formato del correo institucional no es válido. Debe tener la estructura: e_XXXXXXXXXXX@uncp.edu.pe',
      });
    }

    // Verificar si ya existe
    const existing = await pool.query(
      'SELECT id FROM students WHERE LOWER(codigo) = $1',
      [email]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({
        error: 'already_registered',
        message: 'Este correo ya tiene una cuenta registrada. Usa "Iniciar Sesión".',
      });
    }

    // Insertar nuevo estudiante
    const insertResult = await pool.query(
      `INSERT INTO students (codigo, name, is_admin, wallet_balance, points, total_spent)
       VALUES ($1, $2, FALSE, 0.00, 0.00, 0.00)
       RETURNING *`,
      [email, name]
    );
    const newStudent = insertResult.rows[0];

    const token = jwt.sign(
      { id: newStudent.id, codigo: newStudent.codigo, role: 'student' },
      process.env.JWT_SECRET,
      { expiresIn: '4h' }
    );

    console.log(`[REGISTER] Nuevo estudiante registrado: ${email} (${name})`);
    return res.status(201).json({
      role: 'student',
      student: mapStudent(newStudent),
      token,
      isNew: true,
    });

  } catch (err) {
    console.error('[POST /auth/register]', err);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
});

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

module.exports = router;
module.exports.mapStudent = mapStudent;
