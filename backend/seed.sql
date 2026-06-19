-- ============================================================
--  IngenioSnack — Seed SQL (Datos de Prueba)
--  Ejecutar DESPUÉS de schema.sql
-- ============================================================

-- ========================
--  ESTUDIANTES
-- ========================
INSERT INTO students (codigo, name, is_admin, strikes, blocked, stamps, stamps_today, stamps_last_date)
VALUES
  ('e_2024101433H@uncp.edu.pe', 'Julio Cesar Yance Rmoas',    FALSE, 0, FALSE, 3, 0, NULL),
  ('e_2024100596K@uncp.edu.pe', 'Javier Vilchez Camarena',   FALSE, 0, FALSE, 7, 1, CURRENT_DATE),
  ('e_2024101137L@uncp.edu.pe', 'Francis Paul Inga Castillo', FALSE, 0, FALSE, 0, 0, NULL),
  ('e_2024100591F@uncp.edu.pe', 'Steve Patrick Gutierrez Huamanlazo', FALSE, 2, TRUE,  0, 0, NULL),
  ('administrador@adm.com',     'Sr. Julio',                  TRUE,  0, FALSE, 0, 0, NULL);

-- ========================
--  PRODUCTOS
-- ========================
INSERT INTO products (product_code, name, category, price, emoji, available, counts_sandwich)
VALUES
  ('p01', 'Sándwich de Pollo',  'sandwiches', 5.50, '🥪', TRUE,  TRUE),
  ('p02', 'Sándwich de Jamón',  'sandwiches', 5.00, '🥙', TRUE,  TRUE),
  ('p03', 'Sándwich Vegetal',   'sandwiches', 4.50, '🥗', TRUE,  TRUE),
  ('p04', 'Sándwich de Atún',   'sandwiches', 5.00, '🐟', FALSE, TRUE),
  ('p05', 'Café Americano',     'bebidas',    3.00, '☕', TRUE,  FALSE),
  ('p06', 'Jugo de Naranja',    'bebidas',    3.50, '🍊', TRUE,  FALSE),
  ('p07', 'Agua Mineral',       'bebidas',    1.50, '💧', TRUE,  FALSE),
  ('p08', 'Empanada de Carne',  'snacks',     2.50, '🥟', TRUE,  FALSE),
  ('p09', 'Alfajor',            'snacks',     2.00, '🍪', TRUE,  FALSE),
  ('p10', 'Yogurt con Granola', 'snacks',     3.50, '🥣', TRUE,  FALSE);

-- ========================
--  PEDIDOS DEMO
-- ========================
INSERT INTO orders (order_code, student_codigo, student_name, total, status, created_at)
VALUES
  ('#042', 'e_2024101433H@uncp.edu.pe', 'Julio Cesar Yance Rmoas',   8.50, 'pending', NOW() - INTERVAL '5 minutes'),
  ('#041', 'e_2024100596K@uncp.edu.pe', 'Javier Vilchez Camarena', 11.50, 'ready',   NOW() - INTERVAL '10 minutes');

-- Ítems del pedido #042
INSERT INTO order_items (order_id, product_code, name, emoji, qty, unit_price, subtotal)
SELECT o.id, 'p01', 'Sándwich de Pollo', '🥪', 1, 5.50, 5.50
FROM orders o WHERE o.order_code = '#042'
UNION ALL
SELECT o.id, 'p05', 'Café Americano', '☕', 1, 3.00, 3.00
FROM orders o WHERE o.order_code = '#042';

-- Ítems del pedido #041
INSERT INTO order_items (order_id, product_code, name, emoji, qty, unit_price, subtotal)
SELECT o.id, 'p02', 'Sándwich de Jamón', '🥙', 2, 5.00, 10.00
FROM orders o WHERE o.order_code = '#041'
UNION ALL
SELECT o.id, 'p07', 'Agua Mineral', '💧', 1, 1.50, 1.50
FROM orders o WHERE o.order_code = '#041';

-- ========================
--  PEDIDOS HISTÓRICOS (para Analítica)
-- ========================
INSERT INTO orders (order_code, student_codigo, student_name, total, status, order_date, created_at)
VALUES
  ('#038', 'e_2024101433H@uncp.edu.pe', 'Julio Cesar Yance Rmoas',   8.50, 'delivered', CURRENT_DATE - 2, NOW() - INTERVAL '2 days'),
  ('#039', 'e_2024100596K@uncp.edu.pe', 'Javier Vilchez Camarena', 11.00, 'delivered', CURRENT_DATE - 1, NOW() - INTERVAL '1 day'),
  ('#040', 'e_2024101433H@uncp.edu.pe', 'Julio Cesar Yance Rmoas',   8.50, 'delivered', CURRENT_DATE - 3, NOW() - INTERVAL '3 days');

-- Ítems históricos #038
INSERT INTO order_items (order_id, product_code, name, emoji, qty, unit_price, subtotal)
SELECT o.id, 'p01', 'Sándwich de Pollo', '🥪', 1, 5.50, 5.50 FROM orders o WHERE o.order_code = '#038'
UNION ALL
SELECT o.id, 'p05', 'Café Americano', '☕', 1, 3.00, 3.00 FROM orders o WHERE o.order_code = '#038';

-- Ítems históricos #039
INSERT INTO order_items (order_id, product_code, name, emoji, qty, unit_price, subtotal)
SELECT o.id, 'p01', 'Sándwich de Pollo', '🥪', 2, 5.50, 11.00 FROM orders o WHERE o.order_code = '#039';

-- Ítems históricos #040
INSERT INTO order_items (order_id, product_code, name, emoji, qty, unit_price, subtotal)
SELECT o.id, 'p02', 'Sándwich de Jamón', '🥙', 1, 5.00, 5.00 FROM orders o WHERE o.order_code = '#040'
UNION ALL
SELECT o.id, 'p06', 'Jugo de Naranja', '🍊', 1, 3.50, 3.50 FROM orders o WHERE o.order_code = '#040';

-- Verificación
SELECT 'students' AS tabla, COUNT(*) FROM students
UNION ALL SELECT 'products', COUNT(*) FROM products
UNION ALL SELECT 'orders', COUNT(*) FROM orders
UNION ALL SELECT 'order_items', COUNT(*) FROM order_items;
