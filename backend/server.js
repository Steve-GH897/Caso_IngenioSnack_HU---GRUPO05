/**
 * IngenioSnack — Servidor Express Principal
 * Puerto: 3001
 * Sirve la API REST y el frontend estático
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors    = require('cors');
const path    = require('path');
const http    = require('http');
const { Server } = require('socket.io');
const jwt     = require('jsonwebtoken');

const app = express();
const server = http.createServer(app);

// C1: Lista blanca de orígenes permitidos para CORS
const ALLOWED_ORIGINS = [
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://localhost:3000',
  ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : []),
];

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST']
  }
});

// Guardar io en app para usarlo en las rutas
app.set('io', io);

const PORT = process.env.PORT || 3001;

// ──────────────────────────────────────────────
//  Middleware
// ──────────────────────────────────────────────
// C1: CORS restringido a orígenes en lista blanca
app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origin (ej. Postman, same-origin requests)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origen no permitido — ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logger de peticiones (desarrollo)
app.use((req, res, next) => {
  const ts = new Date().toLocaleTimeString('es-PE');
  res.on('finish', () => {
    console.log(`[${ts}] ${req.method} ${req.url} -> ${res.statusCode}`);
  });
  next();
});

// ──────────────────────────────────────────────
//  Servir Frontend Estático
//  Los archivos del cliente están en ../frontend/
// ──────────────────────────────────────────────
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
app.use(express.static(FRONTEND_DIR, {
  index: 'index.html',
  dotfiles: 'ignore',
}));

// ──────────────────────────────────────────────
//  Rutas API
// ──────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/students', require('./routes/students'));
app.use('/api/ingredients', require('./routes/ingredients').router);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'IngenioSnack API',
    timestamp: new Date().toISOString(),
  });
});

// ──────────────────────────────────────────────
//  SPA Fallback — devuelve index.html para rutas no-API
// ──────────────────────────────────────────────
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  } else {
    res.status(404).json({ error: 'Endpoint no encontrado.' });
  }
});

// ──────────────────────────────────────────────
//  Error Handler Global
// ──────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Error no capturado:', err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ──────────────────────────────────────────────
//  Socket.IO: Autenticación y Conexión
// ──────────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: No token provided'));
  }
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
    socket.user = user;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.user.codigo} (Rol: ${socket.user.role})`);
  
  if (socket.user.role === 'admin') {
    socket.join('room_admin');
    console.log(`   -> Se unió a room_admin`);
  } else {
    const studentRoom = `room_student_${socket.user.id}`;
    socket.join(studentRoom);
    console.log(`   -> Se unió a ${studentRoom}`);
  }

  socket.on('disconnect', () => {
    console.log(`🔌 Cliente desconectado: ${socket.user.codigo}`);
  });
});

// ──────────────────────────────────────────────
//  Iniciar Servidor
// ──────────────────────────────────────────────
server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║   🥪  IngenioSnack Backend API       ║');
  console.log(`  ║   http://localhost:${PORT}              ║`);
  console.log('  ╚══════════════════════════════════════╝');
  console.log('');
  console.log('  Endpoints disponibles:');
  console.log('  → GET    /api/health');
  console.log('  → POST   /api/auth/login');
  console.log('  → GET    /api/products');
  console.log('  → PATCH  /api/products/:code/toggle');
  console.log('  → POST   /api/orders');
  console.log('  → GET    /api/orders');
  console.log('  → GET    /api/orders/ready');
  console.log('  → GET    /api/orders/analytics');
  console.log('  → PATCH  /api/orders/:id/status');
  console.log('  → GET    /api/students/:codigo');
  console.log('');
});
