// ============================================================
// RUTAS: Configuración del sistema
// ============================================================

const express = require('express');
const router  = express.Router();

// GET /api/config — leer toda la configuración
router.get('/', async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT clave, valor, descripcion FROM configuracion ORDER BY clave`
    );
    const config = {};
    result.rows.forEach(r => { config[r.clave] = r.valor; });
    res.json({ ok: true, data: config, rows: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PUT /api/config — actualizar un valor
router.put('/', async (req, res) => {
  const { clave, valor } = req.body;
  if (!clave || valor === undefined)
    return res.status(400).json({ ok: false, error: 'clave y valor requeridos' });
  try {
    await req.db.query(
      `INSERT INTO configuracion (clave, valor)
       VALUES ($1, $2)
       ON CONFLICT (clave) DO UPDATE SET valor = $2`,
      [clave, String(valor)]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
