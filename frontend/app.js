/**
 * IngenioSnack — Main Application Logic (v2 — PostgreSQL Backend)
 * Todos los datos se leen/escriben via API REST → Express → PostgreSQL
 */

// =============================================
//  SPLASH & APP INIT
// =============================================
window.addEventListener('DOMContentLoaded', () => {
  // Inicializar tema de colores
  initTheme();

  // Splash screen
  setTimeout(() => {
    const splash = document.getElementById('splash-screen');
    const app    = document.getElementById('app');
    if (splash) splash.classList.add('fade-out');
    if (app) app.classList.remove('hidden');
    if (splash) splash.addEventListener('transitionend', () => splash.style.display = 'none', { once: true });
  }, 2000);

  // Reloj para pantalla pública
  setInterval(updateClock, 1000);
  updateClock();

  // Fechas por defecto de analítica
  const today   = todayStr();
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const fromEl  = document.getElementById('analytics-from');
  const toEl    = document.getElementById('analytics-to');
  if (fromEl) fromEl.value = weekAgo;
  if (toEl)   toEl.value   = today;

  // Enter en el campo de código
  const codigoInput = document.getElementById('input-codigo');
  if (codigoInput) {
    codigoInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') submitLogin();
    });
  }

  // Campo de contraseña dinámico (Mejora 1)
  initLoginDynamicField();

  // Sombra sticky en scroll
  window.addEventListener('scroll', () => {
    const header = document.getElementById('student-header');
    if (header) {
      header.classList.toggle('scrolled', window.scrollY > 10);
    }
    const adminHeader = document.querySelector('.admin-header');
    if (adminHeader) {
      adminHeader.classList.toggle('scrolled', window.scrollY > 10);
    }
  });

  // Verificar que el servidor esté disponible
  checkServerHealth();
});

async function checkServerHealth() {
  try {
    await apiGet('/health');
  } catch {
    showToast('warning', '🔌', 'Sin conexión', 'No se pudo conectar al servidor. Verifica que esté corriendo en http://localhost:3001');
  }
}

// =============================================
//  NAVIGATION
// =============================================
function showView(viewId) {
  document.querySelectorAll('.view').forEach(v => {
    v.classList.remove('active');
    v.style.display = 'none';
  });
  const target = document.getElementById(viewId);
  if (target) {
    target.style.display = 'flex';
    target.classList.add('active');
  }
}

function goToMenu() {
  stopTicketPolling();
  showView('view-menu');
  renderMenu();
}

// =============================================
//  AUTHENTICATION (RF-02)
// =============================================

// Mejora 1: Mostrar/ocultar campo de contraseña dinámicamente según el usuario ingresado
function initLoginDynamicField() {
  const codigoInput = document.getElementById('input-codigo');
  const passWrap = document.getElementById('input-password-wrap');
  const passLabel = document.querySelector('label[for="input-password"]');
  if (!codigoInput || !passWrap) return;

  // Ocultar campo de contraseña inicialmente
  passWrap.style.maxHeight = '0';
  passWrap.style.opacity = '0';
  passWrap.style.overflow = 'hidden';
  passWrap.style.transition = 'max-height 0.35s ease, opacity 0.3s ease';
  if (passLabel) {
    passLabel.style.maxHeight = '0';
    passLabel.style.opacity = '0';
    passLabel.style.overflow = 'hidden';
    passLabel.style.transition = 'max-height 0.35s ease, opacity 0.3s ease';
    passLabel.style.marginTop = '0';
  }

  codigoInput.addEventListener('input', () => {
    const val = codigoInput.value.toLowerCase();
    const isAdmin = val.includes('admin');
    passWrap.style.maxHeight = isAdmin ? '80px' : '0';
    passWrap.style.opacity  = isAdmin ? '1' : '0';
    if (passLabel) {
      passLabel.style.maxHeight = isAdmin ? '40px' : '0';
      passLabel.style.opacity   = isAdmin ? '1' : '0';
      passLabel.style.marginTop = isAdmin ? '15px' : '0';
    }
    const btnSubmit = document.getElementById('btn-login-submit');
    if (btnSubmit) {
      const labelSpan = btnSubmit.querySelector('span');
      if (labelSpan) {
        labelSpan.textContent = isAdmin ? 'Acceder como Administrador' : 'Acceder al Sistema';
      }
    }
    if (!isAdmin) {
      document.getElementById('input-password').value = '';
    }
  });
}


async function submitLogin() {
  const codigo = document.getElementById('input-codigo').value.trim();
  const password = document.getElementById('input-password').value.trim();
  const errEl = document.getElementById('login-error');
  const blockedEl = document.getElementById('login-blocked');

  errEl.classList.add('hidden');
  blockedEl.classList.add('hidden');

  if (!codigo) {
    errEl.textContent = '⚠️ Ingresa tu correo institucional o usuario.';
    errEl.classList.remove('hidden');
    shakeEl(document.getElementById('input-codigo-wrap'));
    return;
  }

  // Pre-validar formato si no es admin
  let isPosibleAdmin = codigo.toLowerCase().includes('admin');
  if (!isPosibleAdmin) {
    const emailLower = codigo.toLowerCase().startsWith('e_') && !codigo.includes('@') ? codigo + '@uncp.edu.pe' : codigo;
    const regex = /^e_\d{9,10}[a-z]@uncp\.edu\.pe?$/i;
    if (!regex.test(emailLower)) {
      errEl.textContent = '⚠️ Formato incorrecto. Ej: e_XXXXXXXXXXA@uncp.edu.pe';
      errEl.classList.remove('hidden');
      shakeEl(document.getElementById('input-codigo-wrap'));
      return;
    }
  }

  setLoginLoading(true);
  try {
    const result = await apiPost('/auth/login', { codigo, pin: password });
    
    APP_STATE.currentUser = result.student;
    localStorage.setItem('jwt_token', result.token);

    if (result.role === 'admin') {
      const adminSubtitle = document.getElementById('admin-header-subtitle');
      if (adminSubtitle && result.student) {
        adminSubtitle.textContent = `${formatShortName(result.student.name)} · Administrador`;
      }
      showView('view-admin');
      await loadAdminOrders();
      await loadAdminInventory();
      renderAdminStats();
      updateAdminTabs();
      showToast('success', '⚙️', 'Panel Admin', 'Bienvenido, Administrador.');
    } else {
      APP_STATE.cart = [];
      document.getElementById('header-greeting').textContent = `Hola, ${formatShortName(result.student.name)}`;
      updateWalletDisplay();
      loadRecommendations();
      requestPushPermission();
      await loadProducts();
      goToMenu();
      showToast('success', '👋', 'Bienvenido/a', `Hola, ${formatShortName(result.student.name)}!`);
    }
    
    connectSocket();
  } catch (err) {
    if (err.status === 403 && err.message === 'blocked') {
      blockedEl.classList.remove('hidden');
      shakeEl(document.getElementById('input-codigo-wrap'));
    } else if (err.status === 403 && err.data?.error === 'not_verified') {
      errEl.textContent = '⚠️ Tu correo no está registrado en la base de datos.';
      errEl.classList.remove('hidden');
      shakeEl(document.getElementById('input-codigo-wrap'));
    } else {
      errEl.textContent = '⚠️ ' + (err.message || 'Credenciales incorrectas o error de red.');
      errEl.classList.remove('hidden');
      shakeEl(document.getElementById('input-codigo-wrap'));
      if (password) shakeEl(document.getElementById('input-password-wrap'));
    }
  } finally {
    setLoginLoading(false);
  }
}

function logout() {
  if (APP_STATE.currentUser) {
    if (!confirm('¿Seguro que deseas cerrar sesión?')) return;
  }
  APP_STATE.currentUser = null;
  APP_STATE.cart = [];
  APP_STATE.products = [];
  APP_STATE.orders = [];
  document.getElementById('input-codigo').value = '';
  const passInput = document.getElementById('input-password');
  if (passInput) passInput.value = '';
  document.getElementById('login-error').classList.add('hidden');
  document.getElementById('login-blocked').classList.add('hidden');
  localStorage.removeItem('jwt_token');

  // Desconectar WebSocket
  if (window._socket) {
    window._socket.disconnect();
    window._socket = null;
  }

  // Detener polling residual
  stopTicketPolling();

  // Resetear a pestaña estudiante
  // (resetear visualización del campo contraseña)
  const passWrap = document.getElementById('input-password-wrap');
  const passLabel = document.querySelector('label[for="input-password"]');
  if (passWrap) { passWrap.style.maxHeight = '0'; passWrap.style.opacity = '0'; }
  if (passLabel) { passLabel.style.maxHeight = '0'; passLabel.style.opacity = '0'; }
  showView('view-login');
}

function setLoginLoading(loading) {
  const btnSubmit = document.getElementById('btn-login-submit');
  if (btnSubmit) btnSubmit.disabled = loading;
  if (loading) {
    if (btnSubmit) btnSubmit.innerHTML = '<span>Verificando...</span>';
  } else {
    if (btnSubmit) {
      const val = document.getElementById('input-codigo')?.value.toLowerCase() || '';
      const isAdmin = val.includes('admin');
      btnSubmit.innerHTML = `<span>${isAdmin ? 'Acceder como Administrador' : 'Acceder al Sistema'}</span><svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>`;
    }
  }
}

// =============================================
//  PRODUCTS — Cargar desde API
// =============================================
async function loadProducts() {
  const grid = document.getElementById('products-grid');
  if (grid) {
    grid.innerHTML = Array(6).fill().map(() => `
      <div class="product-card skeleton-card">
        <div class="skeleton-img skeleton"></div>
        <div class="product-info">
          <div class="skeleton-text-lg skeleton" style="margin: 0 0 8px;"></div>
          <div class="skeleton-text-sm skeleton" style="margin: 0; width: 60%;"></div>
        </div>
        <div class="product-footer" style="border: none;">
          <div class="skeleton-price skeleton" style="margin: 0; width: 40%; height: 16px;"></div>
        </div>
      </div>
    `).join('');
  }
  try {
    APP_STATE.products = await apiGet('/products');
    
    // Inyectar el número de productos activos en el Hero Banner
    const activeProductsCount = APP_STATE.products.filter(p => p.available).length;
    const bannerSub = document.querySelector('.coffee-hero-banner .hero-subtitle');
    if (bannerSub) {
      let badge = document.getElementById('hero-count-badge');
      if (!badge) {
        badge = document.createElement('div');
        badge.id = 'hero-count-badge';
        badge.className = 'hero-count-badge';
        bannerSub.parentNode.insertBefore(badge, bannerSub.nextSibling);
      }
      badge.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg> <span>${activeProductsCount} productos disponibles hoy</span>`;
    }
  } catch (err) {
    showToast('danger', '⚠️', 'Error', 'No se pudo cargar el menú.');
  }
}

// =============================================
//  MENU RENDER (RF-01)
// =============================================
let currentCategory = 'todos';

function filterCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll(`[data-cat="${cat}"]`).forEach(t => t.classList.add('active'));
  renderMenu();
}

function renderMenu() {
  const grid     = document.getElementById('products-grid');
  const filtered = currentCategory === 'todos'
    ? APP_STATE.products
    : APP_STATE.products.filter(p => p.category === currentCategory);

  if (!filtered.length) {
    grid.innerHTML = '<p class="empty-state">No hay productos en esta categoría.</p>';
    return;
  }

  grid.innerHTML = filtered.map(product => `
    <div class="product-card ${!product.available ? 'sold-out' : ''}" id="prod-card-${product.productCode}"
         onclick="${product.available ? `openProductModal('${product.productCode}')` : ''}">
      ${product.starsReward > 0 ? `<div class="stars-badge">⭐ ${product.starsReward}</div>` : ''}
      <div class="product-img-wrap">
        ${product.imageUrl
          ? `<img src="${product.imageUrl}" alt="${product.name}" class="product-real-img"
               onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"  />
             <div class="product-emoji" style="display:none">${product.emoji}</div>`
          : `<div class="product-emoji">${product.emoji}</div>`
        }
        ${!product.available ? '<div class="sold-out-overlay">🚫 Agotado</div>' : ''}
      </div>
      <div class="product-info">
        <div class="product-name">${product.name}</div>
        <div class="product-category"><span class="cat-dot ${product.category}"></span>${product.category.charAt(0).toUpperCase() + product.category.slice(1)}</div>
        ${product.description ? `<div class="product-desc-preview">${product.description.slice(0, 60)}${product.description.length > 60 ? '.' : ''}</div>` : ''}
      </div>
      <div class="product-footer">
        <span class="product-price">${formatPrice(product.price)}</span>
        ${product.available ? `<button class="add-to-cart-btn" onclick="event.stopPropagation(); addToCart('${product.productCode}')">+</button>` : ''}
      </div>
    </div>
  `).join('');
}

// =============================================
//  CART MANAGEMENT
// =============================================
function addToCart(productCode) {
  const product = getProduct(productCode);
  if (!product || !product.available) {
    showToast('warning', '⛔', 'Producto Agotado', 'Este producto ya no está disponible.');
    return;
  }

  const existing = APP_STATE.cart.find(i => i.productCode === productCode);
  if (existing) {
    existing.qty   += 1;
    existing.price  = existing.qty * existing.unitPrice;
  } else {
    APP_STATE.cart.push({
      productCode,
      name:      product.name,
      emoji:     product.emoji,
      qty:       1,
      unitPrice: product.price,
      price:     product.price,
    });
  }

  const card = document.getElementById(`prod-card-${productCode}`);
  if (card) {
    card.classList.add('just-added');
    setTimeout(() => card.classList.remove('just-added'), 400);
  }

  updateCartBadge();
  renderCartItems();
  showToast('success', product.emoji, 'Agregado', `${product.name} añadido al carrito.`);
}

function removeFromCart(productCode) {
  const idx = APP_STATE.cart.findIndex(i => i.productCode === productCode);
  if (idx === -1) return;
  APP_STATE.cart.splice(idx, 1);
  updateCartBadge();
  renderCartItems();
}

function changeQty(productCode, delta) {
  const item = APP_STATE.cart.find(i => i.productCode === productCode);
  if (!item) return;
  item.qty   += delta;
  item.price  = item.qty * item.unitPrice;
  if (item.qty <= 0) { removeFromCart(productCode); return; }
  updateCartBadge();
  renderCartItems();
}

function updateCartBadge() {
  const totalQty = APP_STATE.cart.reduce((s, i) => s + i.qty, 0);
  const totalAmt = APP_STATE.cart.reduce((s, i) => s + i.price, 0);

  // Actualizar los valores del botón flotante
  const floatingBtn = document.getElementById('floating-cart-btn');
  const floatingBadge = document.getElementById('cart-badge-float');
  const floatingTotal = document.getElementById('cart-total-float');
  const cartHeaderCount = document.getElementById('cart-header-count');

  if (floatingBadge) floatingBadge.textContent = totalQty;
  if (floatingTotal) floatingTotal.textContent = `S/ ${totalAmt.toFixed(2)}`;
  if (cartHeaderCount) cartHeaderCount.textContent = totalQty;

  if (floatingBtn) {
    if (totalQty > 0) {
      floatingBtn.classList.remove('hidden');
    } else {
      floatingBtn.classList.add('hidden');
    }
  }

  // Deshabilitar botón de confirmar si está vacío
  const btnConfirm = document.getElementById('btn-confirm-order');
  if (btnConfirm) {
    btnConfirm.disabled = totalQty === 0;
    btnConfirm.style.opacity = totalQty === 0 ? '0.4' : '1';
  }
}

function renderCartItems() {
  const container = document.getElementById('cart-items');
  const totalEl   = document.getElementById('cart-total-amount');
  const walletEl  = document.getElementById('cart-wallet-available');
  if (!container) return;

  if (APP_STATE.cart.length === 0) {
    container.innerHTML = '<p class="empty-state">Tu carrito está vacío.</p>';
    if (totalEl) totalEl.textContent = 'S/ 0.00';
    if (walletEl && APP_STATE.currentUser) {
      walletEl.textContent = `S/ ${parseFloat(APP_STATE.currentUser.walletBalance || 0).toFixed(2)}`;
      walletEl.className = "cart-wallet-val";
    }
    return;
  }

  let total = 0;
  container.innerHTML = APP_STATE.cart.map(item => {
    const product = getProduct(item.productCode);
    const isOOS   = product && !product.available;
    total += item.price;

    const imgHtml = product && product.imageUrl
      ? `<img src="${product.imageUrl}" alt="${item.name}" class="cart-item-thumb" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
         <div class="cart-item-emoji-box" style="display:none">${item.emoji}</div>`
      : `<div class="cart-item-emoji-box">${item.emoji}</div>`;

    return `
      <div class="cart-item ${isOOS ? 'out-of-stock-alert' : ''}" id="cart-item-${item.productCode}">
        ${imgHtml}
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name}</div>
          <div class="cart-item-price">${formatPrice(item.price)}</div>
          ${isOOS ? '<div class="cart-oos-warning">⚠️ ¡Este producto se ha agotado! Retíralo o elige otro.</div>' : ''}
        </div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty('${item.productCode}', -1)">−</button>
          <span class="cart-item-qty">${item.qty}</span>
          <button class="qty-btn" onclick="changeQty('${item.productCode}', 1)">+</button>
          <button class="qty-btn" onclick="removeFromCart('${item.productCode}')" style="color:var(--color-danger)">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  if (totalEl) totalEl.textContent = formatPrice(total);

  if (walletEl && APP_STATE.currentUser) {
    const balance = parseFloat(APP_STATE.currentUser.walletBalance || 0);
    walletEl.textContent = `S/ ${balance.toFixed(2)}`;
    if (balance < total) {
      walletEl.className = "cart-wallet-val cart-wallet-warn";
    } else {
      walletEl.className = "cart-wallet-val";
    }
  }
}

function toggleCart() {
  const panel   = document.getElementById('cart-panel');
  const overlay = document.getElementById('cart-overlay');
  if (panel.classList.contains('open')) {
    closeCart();
  } else {
    panel.classList.add('open');
    overlay.classList.remove('hidden');
    renderCartItems();
  }
}

function closeCart() {
  document.getElementById('cart-panel').classList.remove('open');
  document.getElementById('cart-overlay').classList.add('hidden');
}

// =============================================
//  ORDER CONFIRMATION (RF-01, RF-04, Problema D)
// =============================================
async function confirmOrder() {
  if (APP_STATE.cart.length === 0) {
    showToast('warning', '🛒', 'Carrito Vacío', 'Agrega productos antes de confirmar.');
    return;
  }

  const total = APP_STATE.cart.reduce((sum, item) => sum + item.price, 0);
  if (parseFloat(APP_STATE.currentUser.walletBalance || 0) < total) {
    showToast('danger', '💸', 'Saldo Insuficiente', 'Recarga tu Billetera para realizar este pedido.');
    return;
  }

  // Verificación local de OOS antes de enviar
  const localOOS = APP_STATE.cart.some(item => {
    const p = getProduct(item.productCode);
    return !p || !p.available;
  });
  if (localOOS) {
    showToast('danger', '⚠️', 'Producto Agotado', 'Retira los productos agotados antes de confirmar.');
    renderCartItems();
    return;
  }

  const btnConfirm = document.getElementById('btn-confirm-order');
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '<span class="btn-spinner"></span> <span>Procesando...</span>';
  }

  try {
    const result = await apiPost('/orders', {
      studentCodigo: APP_STATE.currentUser.codigo,
      items: APP_STATE.cart.map(i => ({
        productCode: i.productCode,
        name:        i.name,
        emoji:       i.emoji,
        qty:         i.qty,
      })),
    });

    // Actualizar Billetera y Puntos localmente
    if (APP_STATE.currentUser) {
      APP_STATE.currentUser.points        = result.newPoints;
      APP_STATE.currentUser.walletBalance = result.walletBalance;
      updateWalletDisplay();
    }

    // Limpiar carrito
    APP_STATE.cart = [];
    updateCartBadge();
    closeCart();

    // Mostrar ticket
    renderTicket(result.order);
    showView('view-ticket');

    showToast('success', '✅', 'Pedido Confirmado', `Tu número es ${result.order.orderCode}. ¡Espera tu turno!`);

    if (result.couponEarned) {
      setTimeout(() => {
        showToast('success', '🎉', '¡Cupón Ganado!', '¡Felicitaciones! Ganaste un café americano gratis.');
      }, 1000);
    }

  } catch (err) {
    if (err.status === 409 && err.data?.error === 'out_of_stock') {
      // PROBLEMA D: agotado en el milisegundo del confirm
      showToast('danger', '⚠️', 'Agotado al Confirmar', err.data.message);

      // Marcar visualmente en el carrito
      if (err.data.oosProducts) {
        err.data.oosProducts.forEach(p => {
          const product = getProduct(p.productCode);
          if (product) product.available = false;
        });
        renderMenu();
        renderCartItems();
      }
    } else if (err.status === 409 && err.data?.error === 'active_order') {
      // MEJORA: pedido activo ya existente
      closeCart();
      showToast('warning', '🛒', 'Ya tienes un pedido activo', err.data.message);
    } else {
      showToast('danger', '❌', 'Error', err.message || 'No se pudo confirmar el pedido.');
    }
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled    = false;
      btnConfirm.innerHTML = '✅ Confirmar Pedido';
    }
  }
}

// =============================================
//  TICKET RENDER (RF-01)
// =============================================
function renderTicket(order) {
  document.getElementById('ticket-number').textContent  = order.orderCode;
  document.getElementById('ticket-student').textContent = formatShortName(order.studentName);
  document.getElementById('ticket-time').textContent    = formatTime(order.createdAt);
  document.getElementById('ticket-total').textContent   = formatPrice(order.total);

  const itemsList = document.getElementById('ticket-items-list');
  if (itemsList) {
    itemsList.innerHTML = order.items.map(item => `
      <div class="ticket-item-row">
        <span>${item.emoji} ${item.name} ×${item.qty}</span>
        <span>${formatPrice(item.subtotal || item.unitPrice * item.qty)}</span>
      </div>
    `).join('');
  }

  updateTicketStatus(order.status);
  updateTimeline(order.status);

  // Iniciar timer de tiempo transcurrido
  startElapsedTimer(order.createdAt);

  // Iniciar el polling en tiempo real del ticket si está activo
  if (['pending', 'preparing', 'ready'].includes(order.status)) {
    startTicketPolling(order.id);
  } else {
    stopTicketPolling();
    stopElapsedTimer();
  }
}

function updateTimeline(status) {
  const steps = ['pending', 'preparing', 'ready', 'delivered'];
  const statusIndex = steps.indexOf(status);
  const isCancelled = ['cancelled', 'noshow'].includes(status);
  
  steps.forEach((step, idx) => {
    const el = document.getElementById(`tl-step-${step}`);
    if (!el) return;
    
    el.className = 'tl-step'; // Reset classes
    
    if (isCancelled) {
      if (idx < 3) {
        el.classList.add('tl-done');
      } else if (idx === 3) {
        el.classList.add('tl-cancelled');
        const label = el.querySelector('.tl-label');
        if (label) label.textContent = status === 'noshow' ? 'No Recogido' : 'Cancelado';
      }
    } else {
      if (status === 'delivered') {
        el.classList.add('tl-done');
      } else {
        if (idx < statusIndex) {
          el.classList.add('tl-done');
        } else if (idx === statusIndex) {
          el.classList.add('tl-active');
        }
      }
      if (step === 'delivered') {
        const label = el.querySelector('.tl-label');
        if (label) label.textContent = 'Entregado';
      }
    }
  });
}

function updateTicketStatus(status) {
  const pill = document.getElementById('ticket-status-pill');
  const text = document.getElementById('ticket-status-text');
  const statusMap = {
    pending:   { label: 'Recibido · Esperando Aceptación', cls: 'pending' },
    preparing: { label: 'Preparando... 🧑‍🍳',               cls: 'preparing' },
    ready:     { label: '¡Listo para recoger! ☕',         cls: 'ready' },
    delivered: { label: 'Entregado',                       cls: 'delivered' },
    cancelled: { label: 'Cancelado',                       cls: 'cancelled' },
    noshow:    { label: 'No Recogido',                     cls: 'cancelled' },
  };
  const s = statusMap[status] || statusMap['pending'];
  if (pill) {
    pill.className = `status-pill ${s.cls}`;
    // Pop animation
    pill.classList.remove('status-change-pop');
    void pill.offsetWidth; // trigger reflow
    pill.classList.add('status-change-pop');
  }
  if (text) text.textContent = s.label;
}

// =============================================
//  MY ORDERS — Carga desde API
// =============================================
async function loadMyOrders() {
  const user = APP_STATE.currentUser;
  if (!user) return;

  const container = document.getElementById('my-orders-list');
  if (!container) return;
  container.innerHTML = '<p class="empty-state">Cargando...</p>';

  try {
    const orders = await apiGet(`/orders/student/${encodeURIComponent(user.codigo)}`);
    APP_STATE.orders = orders;
    renderMyOrders();
  } catch (err) {
    container.innerHTML = `<p class="empty-state">Error al cargar pedidos: ${err.message || err}</p>`;
  }
}

function renderMyOrders() {
  const container = document.getElementById('my-orders-list');
  if (!container) return;

  if (!APP_STATE.orders.length) {
    container.innerHTML = '<p class="empty-state">No tienes pedidos recientes.</p>';
    return;
  }

  container.innerHTML = APP_STATE.orders.slice(0, 5).map(order => `
    <div class="my-order-card" onclick="viewOrderTicket('${order.id}')">
      <div class="my-order-info">
        <div class="my-order-num">${order.orderCode}</div>
        <div class="my-order-time">${formatTime(order.createdAt)} · ${order.items.length} producto(s)</div>
      </div>
      <div class="my-order-right">
        <span class="status-badge ${order.status}">${statusLabel(order.status)}</span>
        <span style="font-size:0.8rem; color:var(--color-accent); font-weight:700;">${formatPrice(order.total)}</span>
      </div>
    </div>
  `).join('');
}

function viewOrderTicket(orderId) {
  const order = APP_STATE.orders.find(o => o.id === orderId);
  if (!order) return;
  renderTicket(order);
  showView('view-ticket');
}

function statusLabel(status) {
  const map = {
    pending:   '⏳ Pendiente',
    ready:     '✅ Listo',
    delivered: '📦 Entregado',
    cancelled: '❌ Cancelado',
    noshow:    '⚠️ No Recogido',
  };
  return map[status] || status;
}

// =============================================
//  BILLETERA VIRTUAL Y PUNTOS
// =============================================
function updateWalletDisplay() {
  const user = APP_STATE.currentUser;
  if (!user) return;
  
  // Header badge
  const walletAmount = document.getElementById('wallet-amount');
  if (walletAmount) {
    const newAmount = parseFloat(user.walletBalance || 0).toFixed(2);
    if (walletAmount.textContent !== newAmount) {
      walletAmount.textContent = newAmount;
      walletAmount.classList.remove('value-flash');
      void walletAmount.offsetWidth; // trigger reflow
      walletAmount.classList.add('value-flash');
    }
  }

  // Dashboard cards
  const dashWallet = document.getElementById('dash-wallet');
  if (dashWallet) {
    const newDashAmount = `S/ ${parseFloat(user.walletBalance || 0).toFixed(2)}`;
    if (dashWallet.textContent !== newDashAmount) {
      dashWallet.textContent = newDashAmount;
      dashWallet.classList.remove('value-flash');
      void dashWallet.offsetWidth; // trigger reflow
      dashWallet.classList.add('value-flash');
    }
  }
  
  const dashPoints = document.getElementById('dash-points');
  if (dashPoints) {
    const newPointsText = `${Math.floor(user.points || 0)} ⭐`;
    if (dashPoints.textContent !== newPointsText) {
      dashPoints.textContent = newPointsText;
      dashPoints.classList.remove('value-flash');
      void dashPoints.offsetWidth; // trigger reflow
      dashPoints.classList.add('value-flash');
    }
  }
  
  const dashPointsBar = document.getElementById('dash-points-bar');
  if (dashPointsBar) {
    const percent = Math.min(100, ((user.points || 0) / 300) * 100);
    dashPointsBar.style.width = `${percent}%`;
    dashPointsBar.parentElement.title = "Niveles: Bronce, Plata, Oro";
  }
  
  const dashSpent = document.getElementById('dash-spent');
  if (dashSpent) dashSpent.textContent = `S/ ${parseFloat(user.totalSpent || 0).toFixed(2)}`;

  updateRewardsView(user.points || 0);
}

function updateRewardsView(stars) {
  const starsCount = document.getElementById('rewards-stars-count');
  const tierBadge = document.getElementById('rewards-tier-badge');
  const progressBar = document.getElementById('rewards-progress-bar');
  const nextMsg = document.getElementById('rewards-next-msg');
  const benefitsList = document.getElementById('rewards-benefits-list');
  const circle = document.querySelector('.stars-circle');

  if (!starsCount || !tierBadge) return;

  stars = Math.floor(stars);
  starsCount.textContent = stars;

  let tier = 'Inicial';
  let nextTarget = 100;
  let progress = (stars / 100) * 100;
  let benefits = ['Acumula estrellas en compras seleccionadas.'];
  let tierColor = 'var(--color-primary)';

  if (stars >= 300) {
    tier = 'Oro';
    nextTarget = 300;
    progress = 100;
    benefits = [
      'Acumula estrellas en compras seleccionadas.',
      '1 Combo gratis al mes.',
      'Atención preferencial sin filas.',
      'Regalos sorpresa de la Cafetería.'
    ];
    nextMsg.textContent = `¡Has alcanzado el nivel máximo (Oro)! 🏆 (${stars} ⭐ acumuladas)`;
    tierColor = '#d4af37'; // Gold
  } else if (stars >= 200) {
    tier = 'Plata';
    nextTarget = 300;
    progress = ((stars - 200) / 100) * 100;
    benefits = [
      'Acumula estrellas en compras seleccionadas.',
      '1 Bebida o café gratis al mes.',
      'Acceso a sorteos mensuales.'
    ];
    nextMsg.textContent = `${stars} / 300 ⭐ para Oro (Faltan ${300 - stars} ⭐)`;
    tierColor = '#c0c0c0'; // Silver
  } else if (stars >= 100) {
    tier = 'Bronce';
    nextTarget = 200;
    progress = ((stars - 100) / 100) * 100;
    benefits = [
      'Acumula estrellas en compras seleccionadas.',
      'Acceso a canjes básicos (snacks).'
    ];
    nextMsg.textContent = `${stars} / 200 ⭐ para Plata (Faltan ${200 - stars} ⭐)`;
    tierColor = '#cd7f32'; // Bronze
  } else {
    nextMsg.textContent = `${stars} / 100 ⭐ para Bronce (Faltan ${100 - stars} ⭐)`;
  }

  tierBadge.textContent = `Nivel: ${tier}`;
  tierBadge.style.background = tierColor;
  progressBar.style.width = `${Math.min(100, progress)}%`;
  progressBar.style.background = tierColor;
  
  if (circle) {
    circle.style.setProperty('--color-primary', tierColor);
    circle.style.setProperty('--progress', `${Math.min(100, progress)}%`);
  }
  
  benefitsList.innerHTML = benefits.map(b => `<li>${b}</li>`).join('');

  // Resaltar tarjeta de nivel activa
  const bronzeCard = document.getElementById('tier-card-bronze');
  const silverCard = document.getElementById('tier-card-silver');
  const goldCard = document.getElementById('tier-card-gold');

  if (bronzeCard) bronzeCard.classList.remove('active-tier');
  if (silverCard) silverCard.classList.remove('active-tier');
  if (goldCard) goldCard.classList.remove('active-tier');

  if (stars >= 300) {
    if (goldCard) goldCard.classList.add('active-tier');
  } else if (stars >= 200) {
    if (silverCard) silverCard.classList.add('active-tier');
  } else if (stars >= 100) {
    if (bronzeCard) bronzeCard.classList.add('active-tier');
  }
}

// =============================================
//  RECOMENDACIONES DE PRODUCTOS (Top 3)
// =============================================
function loadRecommendations() {
  // Usa los productos ya cargados (no requiere endpoint admin)
  // Se muestran los 3 primeros disponibles como recomendación
  const container = document.getElementById('recommendations-grid');
  const section   = document.getElementById('recommendations-section');
  if (!container || !section) return;

  const available = APP_STATE.products.filter(p => p.available);
  if (available.length === 0) { section.style.display = 'none'; return; }

  // Tomar hasta 3 productos al azar de los disponibles
  const shuffled = [...available].sort(() => Math.random() - 0.5).slice(0, 3);

  container.innerHTML = shuffled.map(p => `
    <div class="product-card" onclick="openProductModal('${p.productCode}')" style="min-width: 160px; max-width: 200px;">
      <div class="product-img-wrap" style="height: 120px;">
        ${p.imageUrl
          ? `<img src="${p.imageUrl}" alt="${p.name}" class="product-real-img" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" />
             <div class="product-emoji" style="display:none">${p.emoji}</div>`
          : `<div class="product-emoji">${p.emoji}</div>`
        }
      </div>
      <div class="product-info" style="padding: 0.8rem;">
        <div class="product-name" style="font-size: 0.9rem;">${p.name}</div>
        <div class="product-price" style="font-size: 0.85rem; margin-top: 0.3rem;">${formatPrice(p.price)}</div>
      </div>
    </div>
  `).join('');
  section.style.display = 'block';
}

// =============================================
//  ADMIN: ORDER MANAGEMENT
// =============================================
async function loadAdminOrders() {
  try {
    const orders = await apiGet('/orders');
    APP_STATE.orders = orders;
    renderAdminOrders();
    renderAdminStats();
    // BUG-05 FIX: también actualiza pantalla pública
    updatePublicQueue();
  } catch (err) {
    showToast('danger', '⚠️', 'Error', 'No se pudo cargar la cola de pedidos.');
  }
}

function renderAdminOrders() {
  const container = document.getElementById('admin-orders-list');
  if (!container) return;

  const active = APP_STATE.orders.filter(o => !['delivered', 'noshow', 'cancelled'].includes(o.status));

  if (active.length === 0) {
    container.innerHTML = '<p class="empty-state">No hay pedidos activos en este momento.</p>';
    return;
  }

  container.innerHTML = active.map(order => {
    const minutesElapsed = Math.floor((Date.now() - new Date(order.createdAt).getTime()) / 60000);
    let urgencyClass = '';
    if (['pending', 'preparing'].includes(order.status)) {
      if (minutesElapsed >= 10) urgencyClass = 'urgency-high';
      else if (minutesElapsed >= 5) urgencyClass = 'urgency-medium';
    }

    return `
      <div class="admin-order-card ${urgencyClass}" id="admin-order-${order.id}">
        <div class="admin-order-header">
          <div>
            <div class="admin-order-num">${order.orderCode}</div>
            <div class="admin-order-meta">${formatShortName(order.studentName)} · ${formatTime(order.createdAt)}</div>
          </div>
          <span class="status-badge ${order.status}">${statusLabel(order.status)}</span>
        </div>
        <div class="admin-order-body">
          <div class="admin-order-items">
            ${order.items.map(i => `${i.emoji} ${i.name} ×${i.qty}`).join(' &nbsp;|&nbsp; ')}
          </div>
          <div class="admin-order-total">Total: ${formatPrice(order.total)}</div>
        </div>
        <div class="admin-order-actions">
          ${order.status === 'pending' ? `
            <button class="action-btn ready"     onclick="updateOrderStatus(${order.id}, 'preparing')">👨‍🍳 Aceptar (Preparando)</button>
            <button class="action-btn cancel"    onclick="updateOrderStatusSafe(${order.id}, 'cancelled')">❌ Cancelar</button>
          ` : ''}
          ${order.status === 'preparing' ? `
            <button class="action-btn ready"     onclick="updateOrderStatus(${order.id}, 'ready')">✅ Listo para Recoger</button>
            <button class="action-btn cancel"    onclick="updateOrderStatusSafe(${order.id}, 'cancelled')">❌ Cancelar</button>
          ` : ''}
          ${order.status === 'ready' ? `
            <button class="action-btn delivered" onclick="updateOrderStatus(${order.id}, 'delivered')">📦 Marcar Entregado</button>
            <button class="action-btn noshow"    onclick="updateOrderStatusSafe(${order.id}, 'noshow')">⚠️ No Recogido</button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function updateOrderStatus(orderId, newStatus) {
  try {
    const result = await apiPatch(`/orders/${orderId}/status`, { newStatus });

    // Actualizar estado local del pedido
    const order = APP_STATE.orders.find(o => o.id === orderId);
    if (order) order.status = newStatus;

    // PROBLEMA A: Strike feedback
    if (result.studentUpdate) {
      const su = result.studentUpdate;
      if (su.blocked) {
        showToast('danger', '🚫', 'Cuenta Bloqueada',
          `${su.name} acumuló 2 strikes y fue bloqueado automáticamente.`);
      } else {
        showToast('warning', '⚡', 'Strike Registrado',
          `${su.name} recibió un strike (${su.strikes}/2).`);
      }
    }

    // PROBLEMA B: Actualizar pantalla pública en TODOS los cambios de estado
    if (['ready', 'delivered', 'noshow'].includes(newStatus)) {
      showToast('success', '🔔', `Pedido ${result.orderCode}`,
        `Estado cambiado a: ${statusLabel(newStatus)}`);
    }

    renderAdminOrders();
    renderAdminStats();
    updatePublicQueue();  // BUG-05 FIX

  } catch (err) {
    showToast('danger', '❌', 'Error', err.message || 'No se pudo actualizar el estado.');
  }
}

// =============================================
//  ADMIN: INVENTORY (RF-03)
// =============================================
async function loadAdminInventory() {
  try {
    APP_STATE.products = await apiGet('/products');
    APP_STATE.ingredients = await apiGet('/ingredients');
    renderAdminInventory();
  } catch (err) {
    showToast('danger', '⚠️', 'Error', 'No se pudo cargar el inventario.');
  }
}

function renderAdminInventory() {
  const tableBody = document.getElementById('ingredients-table-body');
  const productsContainer = document.getElementById('admin-inventory-list');
  if (!tableBody || !productsContainer) return;

  // Actualizar timestamp de última actualización
  const lastUpdatedEl = document.getElementById('inventory-last-updated');
  if (lastUpdatedEl) {
    const now = new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
    lastUpdatedEl.textContent = `(Sincronizado: ${now})`;
  }

  // Renderizar Insumos en la Tabla
  tableBody.innerHTML = APP_STATE.ingredients.map(ing => {
    let statusClass = 'ok';
    let statusText = 'OK';
    if (ing.stock === 0) {
      statusClass = 'empty';
      statusText = 'Agotado';
    } else if (ing.stock <= ing.low_stock_threshold) {
      statusClass = 'low';
      statusText = 'Bajo Stock';
    }

    return `
      <tr id="ing-row-${ing.id}">
        <td style="padding: 10px 12px; font-weight: 600;">${ing.name}</td>
        <td style="padding: 10px 12px; font-weight: bold; font-family: monospace;">${ing.stock}</td>
        <td style="padding: 10px 12px; color: var(--color-text-muted);">${ing.unit}</td>
        <td style="padding: 10px 12px; color: var(--color-text-muted);">${ing.low_stock_threshold}</td>
        <td style="padding: 10px 12px;">
          <span class="badge-status ${statusClass}">${statusText}</span>
        </td>
        <td style="padding: 10px 12px;">
          <button class="btn-restock-sm" onclick="promptRestock(${ing.id}, '${ing.name}')">⚡ Reabastecer</button>
        </td>
      </tr>
    `;
  }).join('');

  // Renderizar Productos en la Derecha
  productsContainer.innerHTML = APP_STATE.products.map(product => `
    <div class="inventory-item" id="inv-item-${product.productCode}">
      <div class="inventory-item-left">
        <div class="inventory-emoji">${product.emoji}</div>
        <div>
          <div class="inventory-name">${product.name}</div>
          <div class="inventory-price">${formatPrice(product.price)} • ${product.category}</div>
          <div class="inventory-stars" style="margin-top: 4px; font-size: 0.85rem; color: var(--text-color);">
            ⭐ Estrellas: 
            <input type="number" min="0" value="${product.starsReward || 0}" 
                   onchange="updateProductStars('${product.productCode}', this.value)" 
                   style="width: 50px; margin-left: 5px; padding: 2px 4px; border-radius: 4px; border: 1px solid var(--border-color);" />
          </div>
        </div>
      </div>
      <label class="toggle-switch" title="${product.available ? 'Disponible' : 'Agotado'}">
        <input type="checkbox" id="inv-toggle-${product.productCode}"
          ${product.available ? 'checked' : ''}
          onchange="toggleProductAvailability('${product.productCode}')" />
        <span class="toggle-slider"></span>
      </label>
    </div>
  `).join('');
}

async function promptRestock(id, name) {
  const qtyStr = prompt(`¿Cuántas unidades deseas añadir al stock de "${name}"?`, "50");
  if (qtyStr === null) return;
  const qty = parseInt(qtyStr);
  if (isNaN(qty) || qty <= 0) {
    showToast('warning', '⚠️', 'Entrada inválida', 'Ingresa un número entero positivo.');
    return;
  }

  try {
    const updated = await apiPatch(`/ingredients/${id}/stock`, { qty });
    showToast('success', '🌾', 'Reabastecido', `Se añadieron ${qty} unidades de "${name}".`);
    await loadAdminInventory();
  } catch (err) {
    showToast('danger', '❌', 'Error', 'No se pudo actualizar el stock del insumo.');
  }
}

async function createIngredient() {
  const nameEl = document.getElementById('new-ing-name');
  const stockEl = document.getElementById('new-ing-stock');
  const unitEl = document.getElementById('new-ing-unit');

  if (!nameEl || !stockEl || !unitEl) return;

  const name = nameEl.value.trim();
  const stock = parseInt(stockEl.value);
  const unit = unitEl.value.trim() || 'unidades';

  if (!name || isNaN(stock) || stock < 0) {
    showToast('warning', '⚠️', 'Datos incorrectos', 'Ingresa un nombre y stock válidos.');
    return;
  }

  try {
    await apiPost('/ingredients', { name, stock, unit, lowStockThreshold: 5 });
    showToast('success', '✅', 'Creado', `Insumo "${name}" creado exitosamente.`);
    nameEl.value = '';
    stockEl.value = '';
    unitEl.value = '';
    await loadAdminInventory();
  } catch (err) {
    showToast('danger', '❌', 'Error', 'No se pudo crear el insumo.');
  }
}

// === GESTIÓN DE RECETAS ===
let _selectedProductRecipe = null;

async function loadAdminRecipes() {
  try {
    APP_STATE.recipes = await apiGet('/ingredients/recipes');
    APP_STATE.ingredients = await apiGet('/ingredients');
    renderAdminRecipes();
  } catch (err) {
    showToast('danger', '⚠️', 'Error', 'No se pudieron cargar las recetas.');
  }
}

function renderAdminRecipes() {
  const listContainer = document.getElementById('recipes-products-list');
  if (!listContainer) return;

  listContainer.innerHTML = APP_STATE.recipes.map(recipe => {
    const isActive = _selectedProductRecipe && _selectedProductRecipe.product_code === recipe.product_code;
    return `
      <div class="recipe-prod-item ${isActive ? 'active' : ''}" 
           onclick="selectProductForRecipe('${recipe.product_code}')">
        <span style="font-size: 1.2rem;">${recipe.product_emoji || '🍔'}</span>
        <div style="flex: 1;">
          <div style="font-size: 0.85rem; font-weight: bold;">${recipe.product_name}</div>
          <span class="prod-code">${recipe.product_code}</span>
        </div>
        <span style="font-size: 0.72rem; color: var(--color-text-muted); background: var(--color-surface2); padding: 2px 6px; border-radius: 4px;">
          ${recipe.recipe_items.length} insumos
        </span>
      </div>
    `;
  }).join('');
  
  renderRecipeEditor();
}

function selectProductForRecipe(productCode) {
  const recipe = APP_STATE.recipes.find(r => r.product_code === productCode);
  if (!recipe) return;
  
  _selectedProductRecipe = {
    product_code: recipe.product_code,
    product_name: recipe.product_name,
    product_emoji: recipe.product_emoji,
    recipe_items: JSON.parse(JSON.stringify(recipe.recipe_items))
  };
  
  renderAdminRecipes();
}

function renderRecipeEditor() {
  const panel = document.getElementById('recipe-editor-panel');
  if (!panel) return;

  if (!_selectedProductRecipe) {
    panel.innerHTML = `<div class="empty-state" style="color: var(--color-text-dim); text-align: center; padding: 40px;">Selecciona un producto a la izquierda para ver y editar su receta.</div>`;
    return;
  }

  const currentIngredientIds = _selectedProductRecipe.recipe_items.map(item => item.ingredientId);
  const availableIngredientsToAdd = APP_STATE.ingredients.filter(ing => !currentIngredientIds.includes(ing.id));

  const itemsHtml = _selectedProductRecipe.recipe_items.map((item, idx) => `
    <div class="recipe-ing-row">
      <span style="font-size: 1.1rem; margin-right: 4px;">🌾</span>
      <span class="ing-name">${item.ingredientName}</span>
      <input type="number" min="1" value="${item.qtyRequired}" 
             onchange="updateRecipeItemQty(${idx}, this.value)" 
             class="qty-input" />
      <span class="ing-unit">${item.ingredientUnit}</span>
      <button class="btn-remove-ing" onclick="removeIngredientFromRecipe(${idx})" title="Quitar insumo">✕</button>
    </div>
  `).join('');

  const addIngredientSelect = availableIngredientsToAdd.length > 0 
    ? `
      <div class="add-ing-to-recipe">
        <select id="add-recipe-ing-select" class="field-input" style="flex: 1; padding: 8px 12px; font-size: 0.85rem;">
          <option value="">-- Seleccionar insumo para agregar... --</option>
          ${availableIngredientsToAdd.map(ing => `<option value="${ing.id}">${ing.name} (${ing.unit})</option>`).join('')}
        </select>
        <button class="btn-primary" onclick="addIngredientToRecipe()" style="padding: 10px 16px;">+ Agregar</button>
      </div>
    `
    : `<p style="font-size: 0.76rem; color: var(--color-text-dim); text-align: center; margin-top: 12px;">Todos los insumos disponibles ya forman parte de la receta.</p>`;

  panel.innerHTML = `
    <div class="recipe-edit-header" style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); padding-bottom: 12px; margin-bottom: 16px;">
      <div>
        <h4 style="font-size: 1.05rem; font-weight: bold; color: var(--color-primary);">
          ${_selectedProductRecipe.product_emoji || '🍔'} Receta de: ${_selectedProductRecipe.product_name}
        </h4>
        <span style="font-size: 0.72rem; color: var(--color-text-muted); font-family: monospace;">Código: ${_selectedProductRecipe.product_code}</span>
      </div>
      <button class="btn-primary" onclick="saveSelectedRecipe()" style="padding: 10px 20px;">💾 Guardar Receta</button>
    </div>
    
    <div class="recipe-ingredients-list" style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
      ${_selectedProductRecipe.recipe_items.length === 0 
        ? '<p class="empty-state" style="padding: 20px 0;">Este producto no tiene ingredientes asignados aún.</p>'
        : itemsHtml
      }
    </div>
    
    <h5 style="font-size: 0.85rem; font-weight: bold; margin-bottom: 8px; color: var(--color-text-muted);">Añadir Insumo a la Receta</h5>
    ${addIngredientSelect}
  `;
}

function updateRecipeItemQty(index, val) {
  const qty = parseInt(val);
  if (isNaN(qty) || qty <= 0) return;
  _selectedProductRecipe.recipe_items[index].qtyRequired = qty;
}

function removeIngredientFromRecipe(index) {
  _selectedProductRecipe.recipe_items.splice(index, 1);
  renderRecipeEditor();
}

function addIngredientToRecipe() {
  const select = document.getElementById('add-recipe-ing-select');
  if (!select) return;
  
  const ingId = parseInt(select.value);
  if (!ingId) return;

  const ingredient = APP_STATE.ingredients.find(i => i.id === ingId);
  if (!ingredient) return;

  _selectedProductRecipe.recipe_items.push({
    recipeId: null,
    ingredientId: ingredient.id,
    ingredientName: ingredient.name,
    ingredientUnit: ingredient.unit,
    qtyRequired: 1
  });

  renderRecipeEditor();
}

async function saveSelectedRecipe() {
  if (!_selectedProductRecipe) return;
  
  try {
    const body = {
      recipeItems: _selectedProductRecipe.recipe_items.map(item => ({
        ingredientId: item.ingredientId,
        qtyRequired: item.qtyRequired
      }))
    };

    const res = await apiPut(`/ingredients/recipes/${_selectedProductRecipe.product_code}`, body);
    
    showToast('success', '💾', 'Receta guardada', 'La receta se actualizó de manera exitosa.');
    
    // Recargar recetas locales
    await loadAdminRecipes();
  } catch (err) {
    showToast('danger', '❌', 'Error', 'No se pudo guardar la receta.');
  }
}

// Vincular funciones nuevas a window para asegurar su acceso global
window.promptRestock = promptRestock;
window.createIngredient = createIngredient;
window.loadAdminRecipes = loadAdminRecipes;
window.selectProductForRecipe = selectProductForRecipe;
window.updateRecipeItemQty = updateRecipeItemQty;
window.removeIngredientFromRecipe = removeIngredientFromRecipe;
window.addIngredientToRecipe = addIngredientToRecipe;
window.saveSelectedRecipe = saveSelectedRecipe;
window.loadAdminInventory = loadAdminInventory;

async function toggleProductAvailability(productCode) {
  try {
    const updated = await apiPatch(`/products/${productCode}/toggle`, {});

    // Actualizar en caché local
    const idx = APP_STATE.products.findIndex(p => p.productCode === productCode);
    if (idx !== -1) APP_STATE.products[idx] = updated;

    if (!updated.available) {
      showToast('warning', '⛔', 'Producto Agotado', `${updated.name} marcado como agotado.`);
    } else {
      showToast('success', '✅', 'Producto Disponible', `${updated.name} vuelve a estar disponible.`);
    }

  } catch (err) {
    showToast('danger', '❌', 'Error', err.message || 'No se pudo actualizar el producto.');
    // Revertir checkbox visualmente
    const checkbox = document.getElementById(`inv-toggle-${productCode}`);
    if (checkbox) checkbox.checked = !checkbox.checked;
  }
}

async function updateProductStars(productCode, newStars) {
  try {
    const updated = await apiPatch(`/products/${productCode}/stars`, { stars: parseInt(newStars) });
    const idx = APP_STATE.products.findIndex(p => p.productCode === productCode);
    if (idx !== -1) APP_STATE.products[idx] = updated;
    showToast('success', '⭐', 'Estrellas actualizadas', `Ahora ${updated.name} otorga ${updated.starsReward} estrellas.`);
  } catch (err) {
    showToast('danger', '❌', 'Error', 'No se pudieron actualizar las estrellas.');
    // Revertir valor en la vista
    const p = getProduct(productCode);
    if (p) renderAdminInventory();
  }
}

// =============================================
//  ADMIN: ANALYTICS (RF-07)
// =============================================
async function filterAnalytics() {
  const from = document.getElementById('analytics-from').value;
  const to   = document.getElementById('analytics-to').value;

  if (!from || !to) {
    showToast('warning', '📅', 'Selecciona Fechas', 'Elige un rango de fechas.');
    return;
  }

  // BUG-03 FIX: validar rango
  if (new Date(from) > new Date(to)) {
    showToast('warning', '📅', 'Rango Inválido', 'La fecha inicio debe ser anterior o igual a la fecha fin.');
    return;
  }

  const container = document.getElementById('analytics-results');
  if (container) container.innerHTML = '<p class="empty-state">Cargando analítica...</p>';

  try {
    const data    = await apiGet(`/orders/analytics?from=${from}&to=${to}`);
    const medals  = ['🥇', '🥈', '🥉'];
    const maxCount = data.ranking[0]?.count || 1;

    if (!container) return;

    if (data.ranking.length === 0) {
      container.innerHTML = '<p class="empty-state">No hay ventas registradas en este período.</p>';
      return;
    }

    container.innerHTML = `
      <p class="analytics-title">🏆 Top 3 Productos más Vendidos (${from} a ${to})</p>
      ${data.ranking.map((item, i) => `
        <div class="rank-card">
          <div class="rank-medal">${medals[i]}</div>
          <div class="rank-info">
            <div class="rank-name">${item.emoji} ${item.name}</div>
            <div class="rank-bar-wrap">
              <div class="rank-bar">
                <div class="rank-bar-fill" style="width:${(item.count / maxCount) * 100}%"></div>
              </div>
              <span class="rank-count">${item.count} unid.</span>
            </div>
          </div>
          <div class="rank-revenue">${formatPrice(item.revenue)}</div>
        </div>
      `).join('')}
      <p style="font-size:0.75rem;color:var(--color-text-muted);text-align:center;">
        ${data.totalDelivered} pedidos entregados en el período
      </p>
    `;
    // Renderizar gráfico de barras
    renderAnalyticsChart(data);
  } catch (err) {
    if (container) container.innerHTML = '<p class="empty-state">Error al cargar analítica.</p>';
    showToast('danger', '⚠️', 'Error', err.message);
  }
}

// =============================================
//  ADMIN: STATS BAR
// =============================================
function renderAdminStats() {
  const set = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  set('stat-pending',   APP_STATE.orders.filter(o => o.status === 'pending').length);
  set('stat-ready',     APP_STATE.orders.filter(o => o.status === 'ready').length);
  set('stat-delivered', APP_STATE.orders.filter(o => o.status === 'delivered').length);
  set('stat-noshow',    APP_STATE.orders.filter(o => o.status === 'noshow').length);
}

// =============================================
//  ADMIN TABS
// =============================================
async function showAdminTab(tab) {
  APP_STATE.activeAdminTab = tab;
  document.querySelectorAll('.admin-tab-content').forEach(t => t.classList.remove('active'));
  const target = document.getElementById(`admin-tab-${tab}`);
  if (target) target.classList.add('active');
  updateAdminTabs();

  // Ocultar menú desplegable si está abierto
  const menu = document.getElementById('admin-dropdown');
  if (menu) menu.classList.remove('visible');

  if (tab === 'queue')     await loadAdminOrders();
  if (tab === 'inventory') await loadAdminInventory();
  if (tab === 'recipes')   await loadAdminRecipes();
  if (tab === 'analytics') await filterAnalytics();
  if (tab === 'students')  await loadAdminStudents();
}

function updateAdminTabs() {
  ['queue', 'inventory', 'recipes', 'analytics', 'students'].forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    if (btn) btn.classList.toggle('active-tab', APP_STATE.activeAdminTab === t);
  });
}

// =============================================
//  PUBLIC QUEUE VIEW (Problema B)
// =============================================
async function showPublicQueue() {
  const menu = document.getElementById('admin-dropdown');
  if (menu) menu.classList.remove('visible');

  showView('view-queue-public');
  await refreshPublicQueue();
  // Auto-refresh cada 10 segundos
  if (window._publicQueueInterval) clearInterval(window._publicQueueInterval);
  window._publicQueueInterval = setInterval(refreshPublicQueue, 10000);
}

async function refreshPublicQueue() {
  try {
    const readyOrders = await apiGet('/orders/ready');
    const grid = document.getElementById('pq-numbers-grid');
    if (!grid) return;

    if (readyOrders.length === 0) {
      grid.innerHTML = '<div class="pq-empty">Esperando pedidos listos... ⏳</div>';
    } else {
      grid.innerHTML = readyOrders.map(o => `
        <div class="pq-number-chip">${o.orderCode}</div>
      `).join('');
    }
  } catch {
    // Silencioso — la pantalla pública no debe mostrar errores al proyectarse
  }
}

// BUG-05 FIX: se llama desde updateOrderStatus en TODOS los cambios
function updatePublicQueue() {
  // Usar caché local para actualización inmediata
  const readyOrders = APP_STATE.orders.filter(o => o.status === 'ready');
  const grid = document.getElementById('pq-numbers-grid');
  if (!grid) return;

  if (readyOrders.length === 0) {
    grid.innerHTML = '<div class="pq-empty">Esperando pedidos listos... ⏳</div>';
  } else {
    grid.innerHTML = readyOrders.map(o => `
      <div class="pq-number-chip">${o.orderCode}</div>
    `).join('');
  }
}

function leavePublicQueue() {
  if (window._publicQueueInterval) {
    clearInterval(window._publicQueueInterval);
    window._publicQueueInterval = null;
  }
  logout();
}

function updateClock() {
  const el = document.getElementById('pq-clock');
  if (el) el.textContent = new Date().toLocaleTimeString('es-PE');
}

// =============================================
//  TOAST NOTIFICATIONS
// =============================================
function showToast(type, icon, title, message) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-content">
      <div class="toast-title">${title}</div>
      ${message ? `<div class="toast-msg">${message}</div>` : ''}
    </div>
    <button class="toast-close" onclick="dismissToast(this.parentElement)">✕</button>
  `;

  container.appendChild(toast);
  const timer = setTimeout(() => dismissToast(toast), 4500);
  toast._timer = timer;
}

function dismissToast(toast) {
  if (!toast || toast._dismissed) return;
  toast._dismissed = true;
  clearTimeout(toast._timer);
  toast.classList.add('exit');
  setTimeout(() => toast.remove(), 300);
}

// =============================================
//  ANIMATIONS / HELPERS
// =============================================
function shakeEl(el) {
  if (!el) return;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = 'shake-alert 0.5s ease';
  setTimeout(() => el.style.animation = '', 500);
}

// =============================================
//  TEMA CLARO / OSCURO (COFFEE LEO STYLE)
// =============================================
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'light';
  if (savedTheme === 'dark') {
    document.documentElement.classList.add('dark-theme');
    updateThemeIcons('dark');
  } else {
    document.documentElement.classList.remove('dark-theme');
    updateThemeIcons('light');
  }
}

function toggleTheme() {
  const isDark = document.documentElement.classList.contains('dark-theme');
  if (isDark) {
    document.documentElement.classList.remove('dark-theme');
    localStorage.setItem('theme', 'light');
    updateThemeIcons('light');
    showToast('success', '☀️', 'Modo Claro', 'Se ha activado el tema claro "Crema y Café".');
  } else {
    document.documentElement.classList.add('dark-theme');
    localStorage.setItem('theme', 'dark');
    updateThemeIcons('dark');
    showToast('success', '🌙', 'Modo Oscuro', 'Se ha activado el tema oscuro "Espresso".');
  }
}

function updateThemeIcons(theme) {
  const icons = document.querySelectorAll('.theme-icon');
  icons.forEach(icon => {
    icon.textContent = theme === 'dark' ? '☀️' : '🌙';
  });
}

// =============================================
//  POLLING Y AYUDANTES DE TIEMPO REAL / NOMBRES
// =============================================
function formatShortName(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(/\s+/);
  if (parts.length >= 4) {
    return `${parts[0]} ${parts[2]}`;
  } else if (parts.length >= 2) {
    return `${parts[0]} ${parts[1]}`;
  }
  return parts[0];
}

window._adminPollingInterval = null;
// ──────────────────────────────────────────────
//  WebSockets (Tiempo Real)
// ──────────────────────────────────────────────
function connectSocket() {
  const token = localStorage.getItem('jwt_token');
  if (!token) return;

  if (window._socket) {
    window._socket.disconnect();
  }

  // Socket.io está inyectado desde CDN en index.html
  window._socket = io(API_BASE.replace('/api', ''), {
    auth: { token }
  });

  window._socket.on('connect', () => {
    console.log('✅ WebSocket conectado');
  });

  // Eventos para el Administrador
  window._socket.on('new_order', (order) => {
    if (APP_STATE.currentUser?.isAdmin) {
      showToast('success', '🔔', 'Nuevo Pedido', `El estudiante ${order.studentName} ha hecho un nuevo pedido.`);
      loadAdminOrders(); // Recarga la lista
    }
  });

  window._socket.on('order_updated', (data) => {
    if (APP_STATE.currentUser?.isAdmin) {
      loadAdminOrders();
    } else {
      // Es un estudiante
      showToast('success', '🔔', 'Actualización', `Tu pedido ha cambiado a estado: ${data.newStatus}`);
      // Actualizar tarjeta en la pantalla si el usuario está viéndola
      if (document.getElementById('view-ticket').classList.contains('active')) {
        // En ticket view
        if (APP_STATE.orders[0] && APP_STATE.orders[0].id === data.orderId) {
          APP_STATE.orders[0].status = data.newStatus;
          renderTicket(APP_STATE.orders[0]);
        }
      }
    }
  });

  // Eventos para el Estudiante
  window._socket.on('wallet_updated', (data) => {
    if (!APP_STATE.currentUser?.isAdmin) {
      APP_STATE.currentUser.walletBalance = data.walletBalance;
      APP_STATE.currentUser.points = data.points;
      updateWalletDisplay();
      showToast('success', '💰', 'Billetera Actualizada', `Tu nuevo saldo es S/ ${data.walletBalance.toFixed(2)}`);
    }
  });

  // Alertas de inventario y cambios de disponibilidad en tiempo real
  window._socket.on('low_stock_alert', (data) => {
    if (APP_STATE.currentUser?.isAdmin) {
      showToast('danger', '⚠️', 'Bajo Stock', `El insumo "${data.name}" está bajo de stock (${data.stock} ${data.unit}).`);
      if (APP_STATE.activeAdminTab === 'inventory') {
        loadAdminInventory();
      }
    }
  });

  window._socket.on('product_availability_changed', (data) => {
    const idx = APP_STATE.products.findIndex(p => p.productCode === data.productCode);
    if (idx !== -1) {
      APP_STATE.products[idx].available = data.available;
    }
    if (!APP_STATE.currentUser?.isAdmin) {
      renderMenu();
    }
    if (APP_STATE.currentUser?.isAdmin && APP_STATE.activeAdminTab === 'inventory') {
      renderAdminInventory();
    }
  });

  window._socket.on('disconnect', () => {
    console.log('❌ WebSocket desconectado');
  });
}

window._ticketPollingInterval = null;
function startTicketPolling(orderId) {
  if (window._ticketPollingInterval) clearInterval(window._ticketPollingInterval);
  window._ticketPollingInterval = setInterval(async () => {
    try {
      if (!APP_STATE.currentUser) {
        stopTicketPolling();
        return;
      }
      const orders = await apiGet(`/orders/student/${encodeURIComponent(APP_STATE.currentUser.codigo)}`);
      const currentOrder = orders.find(o => o.id === orderId);
      if (currentOrder) {
        const prevStatus = document.getElementById('ticket-status-text')?.textContent;
        updateTicketStatus(currentOrder.status);
        // Notificar si acaba de pasar a "ready"
        const newLabel = document.getElementById('ticket-status-text')?.textContent;
        if (prevStatus !== newLabel && currentOrder.status === 'ready') {
          checkAndNotifyReady(currentOrder);
        }
        updateElapsedDisplay();
        if (['delivered', 'noshow', 'cancelled'].includes(currentOrder.status)) {
          stopTicketPolling();
          stopElapsedTimer();
        }
      }
    } catch (err) {
      console.error('Error al consultar estado del ticket:', err);
    }
  }, 3000);
}

function stopTicketPolling() {
  if (window._ticketPollingInterval) {
    clearInterval(window._ticketPollingInterval);
    window._ticketPollingInterval = null;
  }
}


// =============================================
//  ADMIN: GESTIÓN DE ESTUDIANTES
// =============================================
let _allStudents = [];

async function loadAdminStudents() {
  const container = document.getElementById('admin-students-list');
  if (!container) return;
  container.innerHTML = Array(5).fill().map(() => `
    <div class="student-skeleton">
      <div class="skel-avatar skeleton"></div>
      <div class="skel-info">
        <div class="skel-name skeleton" style="border-radius: 4px;"></div>
        <div class="skel-email skeleton" style="border-radius: 4px;"></div>
      </div>
    </div>
  `).join('');
  try {
    _allStudents = await apiGet('/students');
    renderStudentsList(_allStudents);
  } catch {
    container.innerHTML = '<p class="empty-state">Error al cargar estudiantes.</p>';
  }
}

function filterStudentsList() {
  const q = (document.getElementById('students-search')?.value || '').toLowerCase();
  const filtered = q
    ? _allStudents.filter(s => s.name.toLowerCase().includes(q) || String(s.id).includes(q))
    : _allStudents;
  renderStudentsList(filtered);
}

function renderStudentsList(students) {
  const container = document.getElementById('admin-students-list');
  if (!container) return;
  if (!students.length) {
    container.innerHTML = '<p class="empty-state">No se encontraron estudiantes.</p>';
    return;
  }
  container.innerHTML = students
    .filter(s => !s.isAdmin)
    .map(s => `
      <div class="student-card">
        <div class="student-card-left">
          <div class="student-avatar">${s.name.charAt(0).toUpperCase()}</div>
          <div class="student-info">
            <div class="student-name">${s.name}</div>
            <div class="student-codigo">ID: ${s.id}</div>
            <div class="student-meta" style="margin-top: 5px;">
              <span class="stamp-mini" style="font-weight:700;">💳 Saldo: S/ ${parseFloat(s.walletBalance || 0).toFixed(2)}</span>
              <span class="strike-mini" style="background:var(--color-surface);color:var(--color-primary);">⭐ Pts: ${Math.floor(s.points || 0)}</span>
              <span class="strike-mini" style="background:transparent;">📈 Gastado: S/ ${parseFloat(s.totalSpent || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>
        <div class="student-card-right">
          <button class="action-btn pending" onclick="openRechargeModal('${s.id}', '${s.name}')">💳 Recargar</button>
        </div>
      </div>
    `).join('');
}

let _rechargeId = null;

function openRechargeModal(id, name) {
  _rechargeId = id;
  document.getElementById('recharge-student-name').textContent = name;
  document.getElementById('recharge-amount').value = '';
  const modal = document.getElementById('recharge-modal');
  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('visible'));
}

function closeRechargeModal() {
  const modal = document.getElementById('recharge-modal');
  modal.classList.remove('visible');
  setTimeout(() => { modal.style.display = 'none'; _rechargeId = null; }, 250);
}

async function submitRecharge() {
  if (!_rechargeId) return;
  const amountStr = document.getElementById('recharge-amount').value;
  const amount = parseFloat(amountStr);

  if (isNaN(amount) || amount <= 0) {
    showToast('danger', '⚠️', 'Error', 'Ingresa un monto válido.');
    return;
  }

  showConfirm(
    '💰 Confirmar Recarga',
    `¿Confirmas la recarga de <strong>S/ ${amount.toFixed(2)}</strong> a este estudiante? Recibe el dinero antes de aceptar.`,
    async () => {
      try {
        const res = await apiPatch(`/students/id/${encodeURIComponent(_rechargeId)}/recharge`, { amount });
        showToast('success', '✅', 'Recarga Exitosa', `Se han sumado S/ ${amount.toFixed(2)} a la cuenta.`);
        closeRechargeModal();
        loadAdminStudents();
      } catch (err) {
        showToast('danger', '❌', 'Error', err.message || 'No se pudo procesar la recarga.');
      }
    }
  );
}

// =============================================
//  MODAL DE CONFIRMACIÓN GENÉRICO
// =============================================
function showConfirm(title, message, onConfirm) {
  // Eliminar modal previo si existe
  document.getElementById('confirm-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'confirm-modal';
  modal.className = 'confirm-overlay';
  modal.innerHTML = `
    <div class="confirm-box glass-card">
      <div class="confirm-icon">⚠️</div>
      <h3 class="confirm-title">${title}</h3>
      <p class="confirm-msg">${message}</p>
      <div class="confirm-actions">
        <button class="btn-ghost" onclick="document.getElementById('confirm-modal').remove()">Cancelar</button>
        <button class="btn-danger" id="confirm-ok-btn">Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  requestAnimationFrame(() => modal.classList.add('visible'));

  document.getElementById('confirm-ok-btn').addEventListener('click', () => {
    modal.remove();
    onConfirm();
  });

  // Cerrar al hacer clic en el fondo
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}

// =============================================
//  ACCIONES ADMIN CON CONFIRMACIÓN
// =============================================
function updateOrderStatusSafe(orderId, newStatus) {
  const dangerActions = {
    noshow:    { title: '⚠️ Marcar como No Recogido', msg: 'El estudiante no recogió el pedido. Su saldo ya fue cobrado, por lo que no se le reembolsará nada.' },
    cancelled: { title: '❌ Cancelar Pedido',         msg: 'El pedido será cancelado. <strong>El saldo cobrado será reembolsado</strong> automáticamente a la billetera del estudiante.' },
  };
  if (dangerActions[newStatus]) {
    const { title, msg } = dangerActions[newStatus];
    showConfirm(title, msg, () => updateOrderStatus(orderId, newStatus));
  } else {
    updateOrderStatus(orderId, newStatus);
  }
}

// =============================================
//  NOTIFICACIONES PUSH DEL NAVEGADOR
// =============================================
async function requestPushPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    await Notification.requestPermission();
  }
}

function sendPushNotification(title, body, icon = '/logo.png') {
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon });
  }
}

// Detectar cambio a "ready" en el ticket polling
function checkAndNotifyReady(order) {
  if (order.status === 'ready') {
    sendPushNotification(
      `🎉 ¡Tu pedido ${order.orderCode} está listo!`,
      'Acércate al mostrador de la Cafetería FIS para recogerlo.',
      '/logo.png'
    );
  }
}

// =============================================
//  GRÁFICO DE ANALÍTICA (Chart.js)
// =============================================
let _analyticsChart = null;

function renderAnalyticsChart(data) {
  const canvas = document.getElementById('analytics-chart');
  if (!canvas || !window.Chart) return;

  const ctx = canvas.getContext('2d');
  const isDark = document.documentElement.classList.contains('dark-theme');
  const textColor = isDark ? '#e3f2fd' : '#1a2530';
  const gridColor = isDark ? 'rgba(41,182,246,0.12)' : 'rgba(0,118,168,0.1)';

  if (_analyticsChart) {
    _analyticsChart.destroy();
    _analyticsChart = null;
  }

  if (!data.ranking.length) {
    canvas.style.display = 'none';
    return;
  }
  canvas.style.display = 'block';

  _analyticsChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.ranking.map(r => `${r.emoji} ${r.name}`),
      datasets: [
        {
          label: 'Unidades vendidas',
          data: data.ranking.map(r => r.count),
          backgroundColor: isDark
            ? ['rgba(255,179,0,0.8)', 'rgba(41,182,246,0.7)', 'rgba(38,166,154,0.7)']
            : ['rgba(0,118,168,0.85)', 'rgba(0,137,123,0.75)', 'rgba(197,160,24,0.75)'],
          borderRadius: 10,
          borderSkipped: false,
        },
        {
          label: 'Ingresos (S/)',
          data: data.ranking.map(r => r.revenue),
          backgroundColor: isDark
            ? ['rgba(255,179,0,0.3)', 'rgba(41,182,246,0.25)', 'rgba(38,166,154,0.25)']
            : ['rgba(0,118,168,0.25)', 'rgba(0,137,123,0.2)', 'rgba(197,160,24,0.2)'],
          borderRadius: 10,
          borderSkipped: false,
          yAxisID: 'y2',
        }
      ],
    },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: textColor, font: { family: 'Outfit', size: 13 } } },
        tooltip: {
          callbacks: {
            label: ctx => ctx.datasetIndex === 1
              ? ` S/ ${ctx.parsed.y.toFixed(2)}`
              : ` ${ctx.parsed.y} unid.`
          }
        }
      },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor }, grid: { color: gridColor }, title: { display: true, text: 'Unidades', color: textColor } },
        y2: { position: 'right', ticks: { color: textColor, callback: v => `S/${v}` }, grid: { drawOnChartArea: false }, title: { display: true, text: 'Ingresos (S/)', color: textColor } },
      },
    },
  });
}

// =============================================
//  TIEMPO TRANSCURRIDO EN EL TICKET
// =============================================
let _ticketStartTime = null;
let _elapsedInterval = null;

function startElapsedTimer(createdAt) {
  _ticketStartTime = new Date(createdAt);
  if (_elapsedInterval) clearInterval(_elapsedInterval);
  updateElapsedDisplay();
  _elapsedInterval = setInterval(updateElapsedDisplay, 30000);
}

function stopElapsedTimer() {
  if (_elapsedInterval) { clearInterval(_elapsedInterval); _elapsedInterval = null; }
  _ticketStartTime = null;
}

function updateElapsedDisplay() {
  const el = document.getElementById('ticket-elapsed');
  if (!el || !_ticketStartTime) return;
  const diffMs  = Date.now() - _ticketStartTime.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffSec = Math.floor((diffMs % 60000) / 1000);
  el.textContent = diffMin > 0 ? `Hace ${diffMin} min` : `Hace ${diffSec}s`;
}

// =============================================
//  BOTÓN COMPARTIR PEDIDO (Web Share API)
// =============================================
async function shareOrder(orderCode) {
  const shareData = {
    title: 'Mi pedido en IngenioSnack ☕',
    text: `Mi número de pedido es ${orderCode} en la Cafetería FIS — UNCP. ¡Avísame cuando esté listo!`,
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(shareData.text);
      showToast('success', '📋', 'Copiado', 'Número de pedido copiado al portapapeles.');
    }
  } catch { /* El usuario canceló */ }
}

// =============================================
//  MODAL DE DETALLE DE PRODUCTO
// =============================================
let _modalProductCode = null;

function openProductModal(productCode) {
  const product = getProduct(productCode);
  if (!product) return;
  _modalProductCode = productCode;

  const modal    = document.getElementById('product-modal');
  const imgEl    = document.getElementById('product-modal-img');
  const emojiEl  = document.getElementById('product-modal-emoji');
  const catEl    = document.getElementById('product-modal-category');
  const nameEl   = document.getElementById('product-modal-name');
  const descEl   = document.getElementById('product-modal-desc');
  const priceEl  = document.getElementById('product-modal-price');
  const addBtn   = document.getElementById('product-modal-add-btn');

  if (product.imageUrl) {
    imgEl.src = product.imageUrl;
    imgEl.style.display = 'block';
    emojiEl.style.display = 'none';
  } else {
    imgEl.style.display = 'none';
    emojiEl.textContent = product.emoji;
    emojiEl.style.display = 'flex';
  }

  catEl.textContent   = `${product.emoji} ${product.category.charAt(0).toUpperCase() + product.category.slice(1)}`;
  nameEl.textContent  = product.name;
  descEl.textContent  = product.description || 'Producto fresco de la Cafetería FIS — UNCP.';
  priceEl.textContent = formatPrice(product.price);

  const starsRewardEl = document.getElementById('product-modal-stars-reward');
  if (starsRewardEl) {
    if (product.starsReward && product.starsReward > 0) {
      starsRewardEl.innerHTML = `<span>✨ Ganas +${product.starsReward} ⭐ con este producto</span>`;
      starsRewardEl.style.display = 'flex';
    } else {
      starsRewardEl.style.display = 'none';
    }
  }

  if (addBtn) {
    addBtn.disabled    = false;
    addBtn.textContent = '+ Añadir al carrito';
  }

  modal.style.display = 'flex';
  requestAnimationFrame(() => modal.classList.add('visible'));
}

function closeProductModal() {
  const modal = document.getElementById('product-modal');
  if (!modal) return;
  modal.classList.remove('visible');
  setTimeout(() => { modal.style.display = 'none'; _modalProductCode = null; }, 250);
}

function addFromModal() {
  if (!_modalProductCode) return;
  addToCart(_modalProductCode);
  const addBtn = document.getElementById('product-modal-add-btn');
  if (addBtn) {
    addBtn.textContent = '✅ Añadido';
    addBtn.disabled    = true;
    setTimeout(() => {
      addBtn.textContent = '+ Añadir al carrito';
      addBtn.disabled    = false;
    }, 1200);
  }
}

// Cerrar modal con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeProductModal();
});

// =============================================
//  HISTORIAL FILTRADO DE PEDIDOS (Admin)
// =============================================
async function loadHistory() {
  const status  = document.getElementById('history-status')?.value || 'all';
  const student = document.getElementById('history-student')?.value.trim() || '';
  const from    = document.getElementById('history-from')?.value || '';
  const to      = document.getElementById('history-to')?.value || '';

  const container = document.getElementById('history-list');
  if (!container) return;
  container.innerHTML = '<p class="empty-state">Buscando...</p>';

  try {
    const params = new URLSearchParams();
    if (status && status !== 'all') params.set('status', status);
    if (student) params.set('student', student);
    if (from)    params.set('from', from);
    if (to)      params.set('to', to);

    const orders = await apiGet(`/orders/history?${params.toString()}`);
    renderHistory(orders);
  } catch (err) {
    container.innerHTML = '<p class="empty-state">Error al cargar historial.</p>';
  }
}

function renderHistory(orders) {
  const container = document.getElementById('history-list');
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = '<p class="empty-state">No se encontraron pedidos con esos filtros.</p>';
    return;
  }

  const statusColors = {
    delivered: 'success', noshow: 'cancelled', cancelled: 'cancelled',
    pending: 'pending', preparing: 'preparing', ready: 'ready',
  };

  container.innerHTML = orders.map(order => `
    <div class="history-card">
      <div class="history-card-left">
        <div class="history-order-code">${order.orderCode}</div>
        <div class="history-student">${formatShortName(order.studentName)}</div>
        <div class="history-items">${order.items.map(i => `${i.emoji} ×${i.qty}`).join(' ')}</div>
      </div>
      <div class="history-card-right">
        <span class="status-badge ${statusColors[order.status] || order.status}">${statusLabel(order.status)}</span>
        <div class="history-total">${formatPrice(order.total)}</div>
        <div class="history-date">${new Date(order.createdAt).toLocaleDateString('es-PE')}</div>
      </div>
    </div>
  `).join('');
}

// =============================================
//  FUNCIONES FALTANTES — CRÍTICAS
// =============================================

// FIX: setLoginTab era llamada en logout() pero nunca estaba definida
function setLoginTab(tab) {
  // No-op: la detección admin/estudiante se hace via initLoginDynamicField
  // Solo reseteamos visualmente el campo de contraseña
  const passWrap  = document.getElementById('input-password-wrap');
  const passLabel = document.querySelector('label[for="input-password"]');
  if (passWrap)  { passWrap.style.maxHeight  = '0'; passWrap.style.opacity  = '0'; }
  if (passLabel) { passLabel.style.maxHeight = '0'; passLabel.style.opacity = '0'; }
}

// FIX: unblockStudent estaba exportada pero nunca definida
async function unblockStudent(studentId) {
  showConfirm(
    '🔓 Desbloquear Estudiante',
    '¿Confirmas que deseas desbloquear este estudiante? Se borrarán sus strikes.',
    async () => {
      try {
        await apiPatch(`/students/id/${encodeURIComponent(studentId)}/unblock`, {});
        showToast('success', '✅', 'Desbloqueado', 'El estudiante ha sido desbloqueado.');
        loadAdminStudents();
      } catch (err) {
        showToast('danger', '❌', 'Error', err.message || 'No se pudo desbloquear.');
      }
    }
  );
}

// Exponer para acceso global
window.toggleTheme = toggleTheme;
window.initTheme = initTheme;
window.openPublicQueue = showPublicQueue;
window.showPublicQueue = showPublicQueue;
window.leavePublicQueue = leavePublicQueue;
window.submitLogin = submitLogin;
window.formatShortName = formatShortName;
window.startTicketPolling = startTicketPolling;
window.stopTicketPolling = stopTicketPolling;
window.unblockStudent = unblockStudent;
window.filterStudentsList = filterStudentsList;
window.updateOrderStatusSafe = updateOrderStatusSafe;
window.shareOrder = shareOrder;
window.openProductModal = openProductModal;
window.closeProductModal = closeProductModal;
window.addFromModal = addFromModal;
window.loadHistory = loadHistory;
window.setLoginTab = setLoginTab;

// =============================================
//  ADMIN MENU TOGGLE
// =============================================
function toggleAdminMenu() {
  const menu = document.getElementById('admin-dropdown');
  if (menu) menu.classList.toggle('visible');
}

// Cerrar el menú al hacer clic fuera
document.addEventListener('click', (e) => {
  const container = document.querySelector('.admin-menu-container');
  const menu = document.getElementById('admin-dropdown');
  if (container && menu && !container.contains(e.target)) {
    menu.classList.remove('visible');
  }
});

// Exponer global
window.toggleAdminMenu = toggleAdminMenu;
window.updateProductStars = updateProductStars;

// =============================================
//  STUDENT TABS & RECENT ORDERS
// =============================================
function switchStudentTab(tab) {
  document.querySelectorAll('.student-tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.student-header-nav .nav-item').forEach(el => el.classList.remove('active'));
  
  const targetContent = document.getElementById(`student-tab-${tab}`);
  const targetNav = document.getElementById(`nav-btn-${tab}`);
  
  if (targetContent) targetContent.classList.add('active');
  if (targetNav) targetNav.classList.add('active');

  if (tab === 'orders') {
    renderRecentOrders();
  } else if (tab === 'rewards') {
    fetchRecentOrdersForHistory();
  }
}

async function fetchRecentOrdersForHistory() {
  if (APP_STATE.currentUser) {
    try {
      _allOrders = await apiGet(`/orders/student/${encodeURIComponent(APP_STATE.currentUser.codigo)}`);
      updateStarsHistory();
    } catch (err) {
      console.error('Error loading history for rewards:', err);
    }
  }
}

function updateStarsHistory() {
  const historyList = document.getElementById('rewards-history-list');
  if (!historyList) return;

  const starOrders = _allOrders.filter(o => o.status === 'delivered');
  const historyItems = [];

  for (const order of starOrders) {
    let orderStars = 0;
    const itemsGained = [];
    for (const item of order.items) {
      const p = getProduct(item.productCode);
      if (p && p.starsReward > 0) {
        const itemStars = p.starsReward * item.qty;
        orderStars += itemStars;
        itemsGained.push(`${item.name} (${item.qty}x)`);
      }
    }
    if (orderStars > 0) {
      historyItems.push({
        date: new Date(order.createdAt).toLocaleDateString('es-PE'),
        stars: orderStars,
        description: `+${orderStars} ⭐ por ${itemsGained.join(', ')}`
      });
    }
    if (historyItems.length >= 3) break;
  }

  if (historyItems.length === 0) {
    historyList.innerHTML = `<li style="color: var(--color-text-dim); font-size: 0.85rem; padding: 10px 0; border: none; list-style: none; justify-content: center; display: flex;">Aún no tienes historial de estrellas.</li>`;
  } else {
    historyList.innerHTML = historyItems.map(item => `
      <li style="font-size: 0.85rem; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); padding: 8px 0; list-style: none;">
        <span>${item.description}</span>
        <span style="color: var(--color-text-dim); font-size: 0.75rem;">${item.date}</span>
      </li>
    `).join('');
  }
}

let _ordersPage = 0;
const ORDERS_PER_PAGE = 6;
let _allOrders = [];

async function renderRecentOrders(forceFetch = true) {
  const container = document.getElementById('my-orders-list');
  if (!container || !APP_STATE.currentUser) return;

  try {
    if (forceFetch) {
      _allOrders = await apiGet(`/orders/student/${encodeURIComponent(APP_STATE.currentUser.codigo)}`);
      _ordersPage = 0;
    }

    if (_allOrders.length === 0) {
      container.innerHTML = '<p class="empty-state">No tienes pedidos recientes.</p>';
      return;
    }

    const totalPages = Math.ceil(_allOrders.length / ORDERS_PER_PAGE);
    const start = _ordersPage * ORDERS_PER_PAGE;
    const pageOrders = _allOrders.slice(start, start + ORDERS_PER_PAGE);

    const cardsHTML = pageOrders.map(order => {
      const itemsHtml = order.items.map(i => {
        const product = getProduct(i.productCode);
        const imgHtml = product && product.imageUrl 
          ? `<img src="${product.imageUrl}" alt="${i.name}" style="width: 20px; height: 20px; border-radius: 4px; object-fit: cover;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline'"/>
             <span style="display: none; font-size: 1rem;">${product.emoji}</span>`
          : `<span style="font-size: 1rem;">${(product && product.emoji) || '🍔'}</span>`;
        return `
          <div style="display: flex; align-items: center; gap: 6px; background: var(--color-surface2); padding: 4px 8px; border-radius: 6px; border: 1px solid var(--color-border);">
            ${imgHtml}
            <span style="font-size: 0.8rem; font-weight: 600; color: var(--color-text);">${i.qty}x ${i.name}</span>
          </div>
        `;
      }).join('');

      return `
        <div class="ticket-card" style="padding: 16px; border-radius: var(--radius-lg); box-shadow: var(--shadow-sm); display: flex; flex-direction: column; gap: 12px; height: 100%; justify-content: space-between; border: 1px solid var(--color-border-strong);">
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--color-border); padding-bottom: 8px;">
              <div style="display: flex; flex-direction: column; gap: 2px;">
                <strong style="font-size: 0.95rem; color: var(--color-primary);">Pedido #${order.orderCode}</strong>
                <span style="font-size: 0.72rem; color: var(--color-text-muted);">${new Date(order.createdAt).toLocaleString('es-PE')}</span>
              </div>
              <div style="font-size: 0.9rem; font-weight: bold; background: var(--color-surface2); padding: 4px 8px; border-radius: 6px; color: var(--color-accent); border: 1px solid var(--color-border);">
                ${formatPrice(order.total)}
              </div>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-color); line-height: 1.5;">
              <strong style="display: block; margin-bottom: 6px; font-size: 0.8rem; color: var(--color-text-dim); text-transform: uppercase; letter-spacing: 0.05em;">Productos:</strong>
              <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                ${itemsHtml}
              </div>
            </div>
          </div>
          <button class="btn-reorder" onclick="reorder(${order.id})" style="width: 100%; justify-content: center; padding: 10px; font-size: 0.85rem; font-weight: bold; margin-top: 8px; box-shadow: var(--shadow-sm);">
            🔄 Volver a pedir
          </button>
        </div>
      `;
    }).join('');

    const paginationHTML = totalPages > 1 ? `
      <div class="orders-pagination">
        <button class="pagination-btn" onclick="changeOrdersPage(-1)" ${_ordersPage === 0 ? 'disabled' : ''}>
          ← Anterior
        </button>
        <span class="pagination-info">Página ${_ordersPage + 1} de ${totalPages}</span>
        <button class="pagination-btn" onclick="changeOrdersPage(1)" ${_ordersPage >= totalPages - 1 ? 'disabled' : ''}>
          Siguiente →
        </button>
      </div>
    ` : '';

    container.innerHTML = cardsHTML + paginationHTML;
  } catch (err) {
    console.error('Error fetching recent orders:', err);
    container.innerHTML = `<p class="empty-state">Error al cargar pedidos: ${err.message || err}</p>`;
  }
}

function changeOrdersPage(direction) {
  const totalPages = Math.ceil(_allOrders.length / ORDERS_PER_PAGE);
  _ordersPage = Math.max(0, Math.min(_ordersPage + direction, totalPages - 1));
  renderRecentOrders(false);
}

async function reorder(orderId) {
  try {
    const orders = await apiGet(`/orders/student/${encodeURIComponent(APP_STATE.currentUser.codigo)}`);
    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    // Limpiar carrito actual
    APP_STATE.cart = [];
    
    // Agregar items al carrito
    for (const item of order.items) {
      const p = getProduct(item.productCode);
      if (p && p.available) {
        APP_STATE.cart.push({
          productCode: p.productCode,
          name: p.name,
          emoji: p.emoji,
          qty: item.qty,
          unitPrice: p.price,
          price: p.price * item.qty
        });
      }
    }
    
    updateCartBadge();
    renderCartItems();
    
    if (APP_STATE.cart.length > 0) {
      showToast('success', '🛒', 'Agregado', 'Productos agregados al carrito.');
      toggleCart(); // Abre el carrito
    } else {
      showToast('warning', '⚠️', 'No disponible', 'Los productos de este pedido están agotados.');
    }
  } catch (err) {
    console.error('Error al reordenar:', err);
  }
}

window.switchStudentTab = switchStudentTab;
window.reorder = reorder;
window.changeOrdersPage = changeOrdersPage;
