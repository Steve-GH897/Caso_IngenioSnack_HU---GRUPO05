/**
 * IngenioSnack — API Client
 * Reemplaza a data.js: todas las operaciones van al servidor Express + PostgreSQL
 */

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3001/api'
  : `${window.location.origin}/api`;

// ──────────────────────────────────────────────
//  ESTADO DE LA APLICACIÓN (solo UI, sin datos)
// ──────────────────────────────────────────────
const APP_STATE = {
  currentUser: null,   // { codigo, name, isAdmin, strikes, blocked, stamps, stampsToday }
  cart: [],            // [{ productCode, name, emoji, qty, unitPrice, price }]
  products: [],        // cache de productos
  orders: [],          // cache de pedidos (admin / mis pedidos)
  ingredients: [],     // cache de insumos
  recipes: [],         // cache de recetas
  activeAdminTab: 'queue',
};

// ──────────────────────────────────────────────
//  HTTP HELPERS
// ──────────────────────────────────────────────
// ──────────────────────────────────────────────
//  MANEJADOR DE ERRORES CENTRALIZADO
// ──────────────────────────────────────────────
function handleApiError(err) {
  // Sin conexión al servidor
  if (err instanceof TypeError && err.message.includes('fetch')) {
    if (typeof showToast === 'function') {
      showToast('danger', '👔', 'Sin conexión', 'No se pudo conectar al servidor. ¿Está encendido?');
    }
    return;
  }
  // Token expirado o no autorizado
  if (err.status === 401) {
    if (typeof logout === 'function') logout();
    return;
  }
  // Error interno del servidor
  if (err.status >= 500) {
    if (typeof showToast === 'function') {
      showToast('danger', '🔧', 'Error del servidor', 'Ocurrió un error inesperado. Intenta de nuevo en un momento.');
    }
  }
  // Los errores de negocio (4xx) los maneja cada función con su propio mensaje
}

async function apiGet(path) {
  try {
    const token = localStorage.getItem('jwt_token');
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const err = { status: res.status, message: body.error || 'Error de red', data: body };
      handleApiError(err);
      throw err;
    }
    return res.json();
  } catch (err) {
    if (err.status === undefined) handleApiError(err); // Error de red puro
    throw err;
  }
}

async function apiPost(path, data) {
  try {
    const token = localStorage.getItem('jwt_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = { status: res.status, message: body.error || 'Error de red', data: body };
      handleApiError(err);
      throw err;
    }
    return body;
  } catch (err) {
    if (err.status === undefined) handleApiError(err);
    throw err;
  }
}

async function apiPatch(path, data) {
  try {
    const token = localStorage.getItem('jwt_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = { status: res.status, message: body.error || 'Error de red', data: body };
      handleApiError(err);
      throw err;
    }
    return body;
  } catch (err) {
    if (err.status === undefined) handleApiError(err);
    throw err;
  }
}

async function apiPut(path, data) {
  try {
    const token = localStorage.getItem('jwt_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(data),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = { status: res.status, message: body.error || 'Error de red', data: body };
      handleApiError(err);
      throw err;
    }
    return body;
  } catch (err) {
    if (err.status === undefined) handleApiError(err);
    throw err;
  }
}


// ──────────────────────────────────────────────
//  HELPERS
// ──────────────────────────────────────────────
function formatPrice(amount) {
  return `S/ ${parseFloat(amount).toFixed(2)}`;
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function getProduct(code) {
  return APP_STATE.products.find(p => p.productCode === code);
}

