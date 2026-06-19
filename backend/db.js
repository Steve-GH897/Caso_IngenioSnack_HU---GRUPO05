/**
 * IngenioSnack — Conexión a PostgreSQL
 * Usa connection pooling para eficiencia
 */
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { Pool } = require('pg');

const pool = new Pool({
  user:     process.env.DB_USER,
  host:     process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port:     parseInt(process.env.DB_PORT) || 5432,
  // Opciones de pool
  max:          10,   // máximo 10 conexiones simultáneas
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test de conexión al iniciar
pool.connect((err, client, done) => {
  if (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.message);
    console.error('   Verifica las credenciales en backend/.env');
  } else {
    console.log('✅ Conectado a PostgreSQL — Base de datos: ingeniosnack');
    done();
  }
});

module.exports = pool;
