-- Run these on the PostgreSQL container:
-- docker exec -i <rapidfly-db-container> psql -U postgres -d mundoia_paladiz

-- 1. Per-operator earnings percentage
ALTER TABLE operadores ADD COLUMN IF NOT EXISTS porcentaje_ganancia INTEGER DEFAULT 75;

-- 2. Always-on GPS tracking
ALTER TABLE operadores ADD COLUMN IF NOT EXISTS ultima_lat FLOAT;
ALTER TABLE operadores ADD COLUMN IF NOT EXISTS ultima_lng FLOAT;
ALTER TABLE operadores ADD COLUMN IF NOT EXISTS ultima_posicion TIMESTAMP;

-- 3. Comercio payment tracking
ALTER TABLE facturacion_comercios ADD COLUMN IF NOT EXISTS pagado BOOLEAN DEFAULT FALSE;
ALTER TABLE facturacion_comercios ADD COLUMN IF NOT EXISTS pagado_at TIMESTAMP;

-- 4. Calificación del cliente al pedido (1-5 estrellas, respuesta por WhatsApp)
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS calificacion INTEGER CHECK (calificacion BETWEEN 1 AND 5);
