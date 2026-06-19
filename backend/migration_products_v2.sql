-- ============================================================
--  IngenioSnack — Migración: products v2
--  Añade columnas: description, image_url
--  Ejecutar en pgAdmin > Query Tool sobre la BD "ingeniosnack"
-- ============================================================

-- Agregar columnas (seguro si ya existen)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS image_url   TEXT;

-- Poblar descripciones e imagen para cada producto
UPDATE products SET
  description = 'Jugoso filete de pollo a la plancha con lechuga fresca, tomate y mayonesa casera en pan artesanal.',
  image_url   = '/products/p01.png'
WHERE product_code = 'p01';

UPDATE products SET
  description = 'Finas láminas de jamón ahumado con queso derretido, lechuga y mostaza en pan suave.',
  image_url   = '/products/p02.png'
WHERE product_code = 'p02';

UPDATE products SET
  description = 'Aguacate, pepino, tomate cherry y lechuga mixta en pan integral. Fresco y nutritivo.',
  image_url   = '/products/p03.png'
WHERE product_code = 'p03';

UPDATE products SET
  description = 'Atún en conserva seleccionado con mayonesa, cebolla y tomate en pan tostado.',
  image_url   = '/products/p04.png'
WHERE product_code = 'p04';

UPDATE products SET
  description = 'Café negro preparado con granos de la región, servido en vaso grande. Incluye azúcar al gusto.',
  image_url   = '/products/p05.png'
WHERE product_code = 'p05';

UPDATE products SET
  description = 'Jugo de naranja natural exprimido al momento, sin conservantes. Frío y refrescante.',
  image_url   = '/products/p06.png'
WHERE product_code = 'p06';

UPDATE products SET
  description = 'Agua mineral natural con gas o sin gas. Presentación de 500 ml bien fría.',
  image_url   = '/products/p07.png'
WHERE product_code = 'p07';

UPDATE products SET
  description = 'Empanada horneada rellena de carne molida sazonada con especias peruanas. Crujiente por fuera y jugosa por dentro.',
  image_url   = '/products/p08.png'
WHERE product_code = 'p08';

UPDATE products SET
  description = 'Alfajor peruano clásico con relleno de manjar blanco y cubierto de azúcar impalpable. Elaborado artesanalmente.',
  image_url   = '/products/p09.png'
WHERE product_code = 'p09';

UPDATE products SET
  description = 'Yogurt griego natural con granola crujiente y mezcla de frutos rojos frescos. Alto en proteínas.',
  image_url   = '/products/p10.png'
WHERE product_code = 'p10';

-- Verificar
SELECT product_code, name, image_url, LEFT(description, 40) AS desc_preview FROM products ORDER BY id;
