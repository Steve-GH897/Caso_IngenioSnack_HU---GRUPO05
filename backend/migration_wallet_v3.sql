-- ============================================================
--  IngenioSnack — Migración: Billetera Virtual y Fidelización
--  Añade columnas: wallet_balance, points, total_spent
--  Elimina: strikes, blocked, stamps (opcional, por ahora solo añadimos)
--  Ejecutar en pgAdmin > Query Tool sobre la BD "ingeniosnack"
-- ============================================================

ALTER TABLE students
  ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS points         NUMERIC(8,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_spent    NUMERIC(8,2) DEFAULT 0;

-- Opcional: Para probar rápidamente la billetera, le damos S/ 100 de saldo a todos los estudiantes (no admins)
UPDATE students 
SET wallet_balance = 100.00 
WHERE is_admin = FALSE;

-- Verificar
SELECT codigo, name, wallet_balance, points FROM students ORDER BY id;
