-- ============================================================
--  IngenioSnack — Schema SQL
--  Ejecutar en pgAdmin > Query Tool sobre la BD "ingeniosnack"
-- ============================================================

-- Asegurarse de que no existan tablas previas (orden de dependencias)
DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS students CASCADE;

-- ========================
--  TABLA: students
-- ========================
CREATE TABLE students (
  id               SERIAL PRIMARY KEY,
  codigo           VARCHAR(100)  UNIQUE NOT NULL,
  name             VARCHAR(100) NOT NULL,
  is_admin         BOOLEAN      DEFAULT FALSE,
  strikes          INT          DEFAULT 0 CHECK (strikes >= 0),
  blocked          BOOLEAN      DEFAULT FALSE,
  stamps           INT          DEFAULT 0 CHECK (stamps >= 0 AND stamps <= 10),
  stamps_today     INT          DEFAULT 0 CHECK (stamps_today >= 0 AND stamps_today <= 2),
  stamps_last_date DATE,
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- ========================
--  TABLA: products
-- ========================
CREATE TABLE products (
  id               SERIAL PRIMARY KEY,
  product_code     VARCHAR(10)  UNIQUE NOT NULL,
  name             VARCHAR(100) NOT NULL,
  category         VARCHAR(50)  NOT NULL,
  price            NUMERIC(8,2) NOT NULL CHECK (price >= 0),
  emoji            VARCHAR(10),
  available        BOOLEAN      DEFAULT TRUE,
  counts_sandwich  BOOLEAN      DEFAULT FALSE
);

-- ========================
--  TABLA: orders
-- ========================
CREATE TABLE orders (
  id               SERIAL PRIMARY KEY,
  order_code       VARCHAR(10)  UNIQUE NOT NULL,
  student_codigo   VARCHAR(100)  REFERENCES students(codigo) ON UPDATE CASCADE,
  student_name     VARCHAR(100),
  total            NUMERIC(8,2) DEFAULT 0,
  status           VARCHAR(20)  DEFAULT 'pending'
                  CHECK (status IN ('pending','preparing','ready','delivered','noshow','cancelled')),
  order_date       DATE         DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ  DEFAULT NOW()
);

-- ========================
--  TABLA: order_items
-- ========================
CREATE TABLE order_items (
  id               SERIAL PRIMARY KEY,
  order_id         INT          REFERENCES orders(id) ON DELETE CASCADE,
  product_code     VARCHAR(10)  REFERENCES products(product_code) ON UPDATE CASCADE,
  name             VARCHAR(100),
  emoji            VARCHAR(10),
  qty              INT          NOT NULL CHECK (qty > 0),
  unit_price       NUMERIC(8,2),
  subtotal         NUMERIC(8,2)
);

-- ========================
--  ÍNDICES
-- ========================
CREATE INDEX idx_orders_status      ON orders(status);
CREATE INDEX idx_orders_student     ON orders(student_codigo);
CREATE INDEX idx_orders_date        ON orders(order_date);
CREATE INDEX idx_order_items_order  ON order_items(order_id);

-- ========================
--  VISTAS ÚTILES
-- ========================
CREATE VIEW v_orders_full AS
  SELECT
    o.id,
    o.order_code,
    o.student_codigo,
    o.student_name,
    o.total,
    o.status,
    o.order_date,
    o.created_at,
    json_agg(
      json_build_object(
        'productCode', oi.product_code,
        'name',        oi.name,
        'emoji',       oi.emoji,
        'qty',         oi.qty,
        'unitPrice',   oi.unit_price,
        'subtotal',    oi.subtotal
      ) ORDER BY oi.id
    ) AS items
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
  GROUP BY o.id;
