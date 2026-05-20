// ============================================================
// RUTAS: Reportes
// ============================================================

const express = require('express');
const router  = express.Router();

// GET /api/reportes/semana — reporte pago operadores semana actual
router.get('/semana', async (req, res) => {
  const semana = req.query.semana || getSemana();
  try {
    const result = await req.db.query(
      `SELECT * FROM v_balance_semanal WHERE semana=$1`,
      [semana]
    );
    res.json({ ok: true, semana, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/reportes/comercios — deuda de comercios mes actual
router.get('/comercios', async (req, res) => {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);
  try {
    const result = await req.db.query(
      `SELECT * FROM v_deuda_comercios WHERE mes=$1`,
      [mes]
    );
    res.json({ ok: true, mes, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/reportes/resumen — resumen general del día
router.get('/resumen', async (req, res) => {
  try {
    const hoy = new Date().toISOString().slice(0, 10);
    const [pedidos, operadores, ingresos] = await Promise.all([
      req.db.query(
        `SELECT estado, COUNT(*) as total FROM pedidos
         WHERE DATE(hora_creacion)=$1
         GROUP BY estado`,
        [hoy]
      ),
      req.db.query(
        `SELECT COUNT(*) as total,
          SUM(CASE WHEN disponible THEN 1 ELSE 0 END) as disponibles
         FROM operadores WHERE activo=true`
      ),
      req.db.query(
        `SELECT COALESCE(SUM(costo_delivery),0) as total_delivery
         FROM pedidos
         WHERE DATE(hora_creacion)=$1 AND estado='entregado'`,
        [hoy]
      )
    ]);

    res.json({
      ok: true,
      fecha: hoy,
      pedidos: pedidos.rows,
      operadores: operadores.rows[0],
      ingresos: ingresos.rows[0]
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/reportes/empresa — ganancias RapiFly (25%) por semana
router.get('/empresa', async (req, res) => {
  const semana = req.query.semana || getSemana();
  try {
    const result = await req.db.query(
      `SELECT
         b.semana,
         COUNT(b.id)                                   AS total_servicios,
         COALESCE(SUM(b.monto + b.monto_empresa), 0)  AS total_delivery,
         COALESCE(SUM(b.monto_empresa), 0)             AS ganancia_empresa,
         COALESCE(SUM(b.monto), 0)                     AS pagado_operadores
       FROM balance_operadores b
       WHERE b.semana = $1
       GROUP BY b.semana`,
      [semana]
    );
    res.json({ ok: true, semana, data: result.rows[0] || {} });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/reportes/exportar/semana — CSV de pagos operadores
router.get('/exportar/semana', async (req, res) => {
  const semana = req.query.semana || getSemana();
  try {
    const result = await req.db.query(
      `SELECT * FROM v_balance_semanal WHERE semana=$1`,
      [semana]
    );

    let csv = 'Operador,Telefono,Semana,Servicios,Total Ganado,Pagado,Pendiente\n';
    result.rows.forEach(r => {
      csv += `${r.operador_nombre},${r.operador_telefono},${r.semana},`;
      csv += `${r.total_servicios},${r.total_ganado},${r.total_pagado},${r.total_pendiente}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=pagos-${semana}.csv`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/reportes/exportar/comercios — CSV de deuda comercios
router.get('/exportar/comercios', async (req, res) => {
  const mes = req.query.mes || new Date().toISOString().slice(0, 7);
  try {
    const result = await req.db.query(
      `SELECT * FROM v_deuda_comercios WHERE mes=$1`,
      [mes]
    );

    let csv = 'Comercio,Telefono,Mes,Pedidos,Total Delivery,Pagado,Deuda Pendiente\n';
    result.rows.forEach(r => {
      csv += `${r.comercio_nombre},${r.comercio_telefono},${r.mes},`;
      csv += `${r.total_pedidos},${r.total_delivery},${r.total_pagado},${r.deuda_pendiente}\n`;
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=comercios-${mes}.csv`);
    res.send(csv);
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
