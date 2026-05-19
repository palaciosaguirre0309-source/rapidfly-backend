// ============================================================
// RUTAS: Balance de Operadores
// ============================================================

const express = require('express');
const router  = express.Router();

// GET /api/balance/:operador_id — balance semana actual
router.get('/:operador_id', async (req, res) => {
  const semana = getSemana();
  try {
    const result = await req.db.query(
      `SELECT 
        b.semana,
        COUNT(b.id) AS total_servicios,
        SUM(b.monto) AS total_ganado,
        SUM(CASE WHEN b.pagado THEN b.monto ELSE 0 END) AS pagado,
        SUM(CASE WHEN NOT b.pagado THEN b.monto ELSE 0 END) AS pendiente,
        json_agg(json_build_object(
          'pedido_id', b.pedido_id,
          'monto', b.monto,
          'pagado', b.pagado,
          'fecha', b.created_at
        ) ORDER BY b.created_at DESC) AS servicios
       FROM balance_operadores b
       WHERE b.operador_id=$1 AND b.semana=$2
       GROUP BY b.semana`,
      [req.params.operador_id, semana]
    );
    res.json({ ok: true, semana, data: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/balance/:operador_id/historial — todas las semanas
router.get('/:operador_id/historial', async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT * FROM v_balance_semanal WHERE operador_id=$1`,
      [req.params.operador_id]
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/balance/pagar/:operador_id — marcar semana como pagada
router.patch('/pagar/:operador_id', async (req, res) => {
  const { semana } = req.body;
  try {
    const result = await req.db.query(
      `UPDATE balance_operadores SET pagado=true
       WHERE operador_id=$1 AND semana=$2
       RETURNING COUNT(*)`,
      [req.params.operador_id, semana]
    );
    res.json({ ok: true, message: `Semana ${semana} marcada como pagada` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

function getSemana() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week  = Math.ceil((((now - start) / 86400000) + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

module.exports = router;
