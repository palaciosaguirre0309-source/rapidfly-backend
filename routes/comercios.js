// ============================================================
// RUTAS: Gestión de Comercios
// ============================================================

const express = require('express');
const router  = express.Router();

// GET /api/comercios — listar todos
router.get('/', async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT id, nombre, telefono, direccion, tarifa_zona, activo, created_at
       FROM comercios ORDER BY nombre ASC`
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/comercios — crear comercio
router.post('/', async (req, res) => {
  const { nombre, telefono, tarifa_zona, direccion } = req.body;
  if (!nombre || !telefono)
    return res.status(400).json({ ok: false, error: 'nombre y telefono son requeridos' });
  try {
    const result = await req.db.query(
      `INSERT INTO comercios (nombre, telefono, tarifa_zona, direccion) VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre, telefono.startsWith('+') ? telefono : '+' + telefono.replace(/^\+/, ''), tarifa_zona || null, direccion || null]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505')
      return res.status(400).json({ ok: false, error: 'Teléfono ya registrado' });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/comercios/:id — actualizar
router.patch('/:id', async (req, res) => {
  const { nombre, telefono, tarifa_zona, activo, direccion } = req.body;
  try {
    const result = await req.db.query(
      `UPDATE comercios SET
        nombre      = COALESCE($1, nombre),
        telefono    = COALESCE($2, telefono),
        tarifa_zona = COALESCE($3, tarifa_zona),
        activo      = COALESCE($4, activo),
        direccion   = COALESCE($5, direccion)
       WHERE id = $6 RETURNING *`,
      [nombre || null, telefono || null, tarifa_zona !== undefined ? (tarifa_zona || null) : null, activo ?? null, direccion || null, req.params.id]
    );
    if (!result.rows.length)
      return res.status(404).json({ ok: false, error: 'Comercio no encontrado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/comercios/:id — desactivar (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await req.db.query(`UPDATE comercios SET activo = false WHERE id = $1`, [req.params.id]);
    res.json({ ok: true, message: 'Comercio desactivado' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/comercios/:id/eliminar — eliminar permanentemente
router.delete('/:id/eliminar', async (req, res) => {
  try {
    // Deslinkar pedidos históricos
    await req.db.query(`UPDATE pedidos SET comercio_id=NULL WHERE comercio_id=$1 AND estado IN ('entregado','cancelado')`, [req.params.id]);
    await req.db.query(`DELETE FROM facturacion_comercios WHERE comercio_id=$1`, [req.params.id]);
    await req.db.query(`DELETE FROM comercios WHERE id=$1`, [req.params.id]);
    res.json({ ok: true, message: 'Comercio eliminado permanentemente' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
