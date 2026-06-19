-- ============================================================
--  IngenioSnack — Migración: Inventario de Insumos y Recetas
--  Ejecutar en pgAdmin o vía script de Node sobre la BD "ingeniosnack"
-- ============================================================

-- Crear tablas si no existen
CREATE TABLE IF NOT EXISTS ingredients (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(100) UNIQUE NOT NULL,
  stock               INT DEFAULT 0 CHECK (stock >= 0),
  unit                VARCHAR(20) DEFAULT 'unidades',
  low_stock_threshold INT DEFAULT 5 CHECK (low_stock_threshold >= 0)
);

CREATE TABLE IF NOT EXISTS recipes (
  id            SERIAL PRIMARY KEY,
  product_code  VARCHAR(10) REFERENCES products(product_code) ON DELETE CASCADE,
  ingredient_id INT REFERENCES ingredients(id) ON DELETE CASCADE,
  qty_required  INT DEFAULT 1 CHECK (qty_required > 0),
  UNIQUE (product_code, ingredient_id)
);

-- Limpiar tablas antes de poblar (para evitar duplicados en pruebas)
TRUNCATE TABLE recipes CASCADE;
TRUNCATE TABLE ingredients CASCADE;

-- Insertar Insumos Iniciales
INSERT INTO ingredients (id, name, stock, unit, low_stock_threshold)
VALUES
  (1, 'Pollo (gr)', 2000, 'gr', 500),
  (2, 'Pan (unidades)', 50, 'unidades', 10),
  (3, 'Lechuga (gr)', 1000, 'gr', 200),
  (4, 'Tomate (gr)', 1000, 'gr', 200),
  (5, 'Jamón (rebanadas)', 80, 'rebanadas', 20),
  (6, 'Queso (rebanadas)', 80, 'rebanadas', 20),
  (7, 'Palta (gr)', 800, 'gr', 150),
  (8, 'Pepino (gr)', 500, 'gr', 100),
  (9, 'Atún (gr)', 1500, 'gr', 300),
  (10, 'Café en grano (gr)', 1000, 'gr', 200),
  (11, 'Naranjas (unidades)', 40, 'unidades', 10),
  (12, 'Agua embotellada (unidades)', 30, 'unidades', 8),
  (13, 'Empanada congelada (unidades)', 20, 'unidades', 5),
  (14, 'Alfajor preparado (unidades)', 25, 'unidades', 5),
  (15, 'Yogurt (ml)', 3000, 'ml', 600),
  (16, 'Granola (gr)', 800, 'gr', 150);

-- Reiniciar secuencia de IDs de ingredientes
SELECT setval('ingredients_id_seq', 16);

-- Insertar Recetas Iniciales
INSERT INTO recipes (product_code, ingredient_id, qty_required)
VALUES
  -- Sándwich de Pollo (p01): 2 panes, 100gr pollo, 15gr lechuga, 20gr tomate
  ('p01', 2, 2),
  ('p01', 1, 100),
  ('p01', 3, 15),
  ('p01', 4, 20),

  -- Sándwich de Jamón (p02): 2 panes, 2 rebanadas jamón, 2 rebanadas queso, 15gr lechuga
  ('p02', 2, 2),
  ('p02', 5, 2),
  ('p02', 6, 2),
  ('p02', 3, 15),

  -- Sándwich Vegetal (p03): 2 panes, 40gr palta, 30gr pepino, 15gr lechuga, 20gr tomate
  ('p03', 2, 2),
  ('p03', 7, 40),
  ('p03', 8, 30),
  ('p03', 3, 15),
  ('p03', 4, 20),

  -- Sándwich de Atún (p04): 2 panes, 80gr atún, 20gr tomate
  ('p04', 2, 2),
  ('p04', 9, 80),
  ('p04', 4, 20),

  -- Café Americano (p05): 15gr café en grano
  ('p05', 10, 15),

  -- Jugo de Naranja (p06): 4 naranjas
  ('p06', 11, 4),

  -- Agua Mineral (p07): 1 agua embotellada
  ('p07', 12, 1),

  -- Empanada de Carne (p08): 1 empanada congelada
  ('p08', 13, 1),

  -- Alfajor (p09): 1 alfajor preparado
  ('p09', 14, 1),

  -- Yogurt con Granola (p10): 200ml yogurt, 30gr granola
  ('p10', 15, 200),
  ('p10', 16, 30);
