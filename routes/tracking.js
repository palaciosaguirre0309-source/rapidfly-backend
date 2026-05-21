// ============================================================
// RUTAS: Tracking GPS
// ============================================================

const express = require('express');
const router  = express.Router();

// POST /api/tracking — guardar punto GPS
router.post('/', async (req, res) => {
  const { pedido_id, operador_id, lat, lng } = req.body;
  if (!pedido_id || !operador_id || !lat || !lng)
    return res.status(400).json({ ok: false, error: 'Faltan campos requeridos' });

  try {
    await req.db.query(
      `INSERT INTO tracking (pedido_id, operador_id, lat, lng)
       VALUES ($1,$2,$3,$4)`,
      [pedido_id, operador_id, lat, lng]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/tracking/posiciones-activas — última posición de cada operador en curso
router.get('/posiciones-activas', async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT DISTINCT ON (t.operador_id)
         t.operador_id, t.lat, t.lng, t.timestamp, t.pedido_id,
         o.nombre AS operador_nombre
       FROM tracking t
       JOIN operadores o ON t.operador_id = o.id
       JOIN pedidos p ON t.pedido_id = p.id
       WHERE p.estado IN ('asignado','en_camino')
       ORDER BY t.operador_id, t.timestamp DESC`
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/tracking/:pedido_id — historial GPS de un pedido
router.get('/:pedido_id', async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT lat, lng, timestamp FROM tracking
       WHERE pedido_id=$1
       ORDER BY timestamp ASC`,
      [req.params.pedido_id]
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/tracking/:pedido_id/ultima — última posición
router.get('/:pedido_id/ultima', async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT lat, lng, timestamp FROM tracking
       WHERE pedido_id=$1
       ORDER BY timestamp DESC LIMIT 1`,
      [req.params.pedido_id]
    );
    res.json({ ok: true, data: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
