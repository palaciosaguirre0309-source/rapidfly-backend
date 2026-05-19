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
      `SELECT * FROM operadores 
       WHERE disponible=true AND activo=true 
       ORDER BY created_at ASC`
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/operadores/:id — detalle
router.get('/:id', async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT * FROM operadores WHERE id=$1`,
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ ok: false, error: 'Operador no encontrado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/operadores — crear operador
router.post('/', async (req, res) => {
  const { nombre, telefono } = req.body;
  if (!nombre || !telefono)
    return res.status(400).json({ ok: false, error: 'nombre y telefono son requeridos' });

  try {
    const result = await req.db.query(
      `INSERT INTO operadores (nombre, telefono) 
       VALUES ($1, $2) RETURNING *`,
      [nombre, telefono]
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
  const { nombre, telefono, activo } = req.body;
  try {
    const result = await req.db.query(
      `UPDATE operadores SET
        nombre   = COALESCE($1, nombre),
        telefono = COALESCE($2, telefono),
        activo   = COALESCE($3, activo)
       WHERE id=$4 RETURNING *`,
      [nombre, telefono, activo, req.params.id]
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
      `UPDATE operadores SET disponible=$1 
       WHERE id=$2 RETURNING *`,
      [disponible, req.params.id]
    );

    // Notificar al admin via WebSocket
    req.io.to('admin').emit('operador:disponibilidad', {
      operador_id: req.params.id,
      disponible
    });

    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/operadores/:id — desactivar (no eliminar)
router.delete('/:id', async (req, res) => {
  try {
    await req.db.query(
      `UPDATE operadores SET activo=false WHERE id=$1`,
      [req.params.id]
    );
    res.json({ ok: true, message: 'Operador desactivado' });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
