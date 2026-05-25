// ============================================================
// RUTAS: Operadores
// ============================================================

const express = require('express');
const router  = express.Router();

// GET /api/operadores — listar todos
router.get('/', async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT * FROM operadores ORDER BY nombre ASC`
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/operadores/disponibles — solo los disponibles
router.get('/disponibles', async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT * FROM operadores WHERE disponible=true AND activo=true ORDER BY created_at ASC`
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/operadores/:id/push-subscription — guardar suscripción push
router.post('/:id/push-subscription', async (req, res) => {
  const { subscription } = req.body;
  try {
    await req.db.query(
      `UPDATE operadores SET push_subscription=$1 WHERE id=$2`,
      [JSON.stringify(subscription), req.params.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/operadores/:id — detalle
router.get('/:id', async (req, res) => {
  try {
    const result = await req.db.query(`SELECT * FROM operadores WHERE id=$1`, [req.params.id]);
    if (result.rows.length === 0)
      return res.status(404).json({ ok: false, error: 'Operador no encontrado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/operadores — crear operador
router.post('/', async (req, res) => {
  const { nombre, telefono, porcentaje_ganancia } = req.body;
  if (!nombre || !telefono)
    return res.status(400).json({ ok: false, error: 'nombre y telefono son requeridos' });
  try {
    const result = await req.db.query(
      `INSERT INTO operadores (nombre, telefono, porcentaje_ganancia)
       VALUES ($1, $2, $3) RETURNING *`,
      [nombre, telefono, porcentaje_ganancia || 75]
    );
    res.status(201).json({ ok: true, data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505')
      return res.status(400).json({ ok: false, error: 'Teléfono ya registrado' });
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/operadores/:id — actualizar datos
router.patch('/:id', async (req, res) => {
  const { nombre, telefono, activo, porcentaje_ganancia } = req.body;
  try {
    const result = await req.db.query(
      `UPDATE operadores SET
        nombre              = COALESCE($1, nombre),
        telefono            = COALESCE($2, telefono),
        activo              = COALESCE($3, activo),
        porcentaje_ganancia = COALESCE($4, porcentaje_ganancia)
       WHERE id=$5 RETURNING *`,
      [nombre, telefono, activo, porcentaje_ganancia, req.params.id]
    );
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/operadores/:id/disponibilidad — toggle disponible
router.patch('/:id/disponibilidad', async (req, res) => {
  const { disponible } = req.body;
  try {
    const result = await req.db.query(
      `UPDATE operadores SET disponible=$1 WHERE id=$2 RETURNING *`,
      [disponible, req.params.id]
    );
    req.io.to('admin').emit('operador:disponibilidad', { operador_id: req.params.id, disponible });
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/operadores/:id — desactivar (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    await req.db.query(`UPDATE operadores SET activo=false WHERE id=$1`, [req.params.id]);
    res.json({ ok: true, message: 'Operador desactivado' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/operadores/:id/eliminar — eliminar permanentemente
router.delete('/:id/eliminar', async (req, res) => {
  try {
    // Deslinkar pedidos históricos (preservar historial)
    await req.db.query(`UPDATE pedidos SET operador_id=NULL WHERE operador_id=$1 AND estado IN ('entregado','cancelado')`, [req.params.id]);
    // Eliminar el operador
    await req.db.query(`DELETE FROM operadores WHERE id=$1`, [req.params.id]);
    res.json({ ok: true, message: 'Operador eliminado permanentemente' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
