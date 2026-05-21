// ============================================================
// RUTAS: Autenticación
// Login para operadores y panel admin
// ============================================================

const express = require('express');
const router  = express.Router();
const jwt     = require('jsonwebtoken');

// POST /api/auth/operador — login operador por teléfono
router.post('/operador', async (req, res) => {
  const { telefono } = req.body;
  if (!telefono)
    return res.status(400).json({ ok: false, error: 'Teléfono requerido' });

  try {
    // Buscar operador por teléfono en varios formatos
    const formatos = [
      telefono,
      '+' + telefono,
      telefono.replace('+', '')
    ];

    const result = await req.db.query(
      `SELECT * FROM operadores 
       WHERE telefono = ANY($1) AND activo=true`,
      [formatos]
    );

    if (result.rows.length === 0)
      return res.status(404).json({ 
        ok: false, error: 'Operador no encontrado o inactivo' 
      });

    const operador = result.rows[0];

    // Generar token JWT
    const token = jwt.sign(
      { 
        id: operador.id, 
        nombre: operador.nombre,
        telefono: operador.telefono,
        rol: 'operador' 
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ 
      ok: true, 
      token,
      operador: {
        id: operador.id,
        nombre: operador.nombre,
        telefono: operador.telefono,
        disponible: operador.disponible
      }
    });

  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/auth/comercio — login comercio por teléfono
router.post('/comercio', async (req, res) => {
  const { telefono } = req.body;
  if (!telefono)
    return res.status(400).json({ ok: false, error: 'Teléfono requerido' });
  try {
    const formatos = [telefono, '+' + telefono, telefono.replace('+', '')];
    const result = await req.db.query(
      `SELECT * FROM comercios WHERE telefono = ANY($1) AND activo = true`,
      [formatos]
    );
    if (!result.rows.length)
      return res.status(404).json({ ok: false, error: 'Comercio no encontrado o inactivo' });
    const comercio = result.rows[0];
    const token = jwt.sign(
      { id: comercio.id, nombre: comercio.nombre, rol: 'comercio' },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );
    res.json({ ok: true, token, comercio: { id: comercio.id, nombre: comercio.nombre } });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/auth/admin — login panel admin
router.post('/admin', async (req, res) => {
  const { usuario, password } = req.body;

  // Credenciales desde variables de entorno
  const ADMIN_USER = process.env.ADMIN_USER || 'admin';
  const ADMIN_PASS = process.env.ADMIN_PASSWORD || 'rapidfly2026';

  if (usuario !== ADMIN_USER || password !== ADMIN_PASS)
    return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });

  const token = jwt.sign(
    { rol: 'admin', usuario },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ ok: true, token });
});

// GET /api/auth/verificar — verificar token
router.get('/verificar', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer '))
    return res.status(401).json({ ok: false, error: 'Token requerido' });

  try {
    const token = auth.split(' ')[1];
    const data  = jwt.verify(token, process.env.JWT_SECRET);
    res.json({ ok: true, data });
  } catch (err) {
    res.status(401).json({ ok: false, error: 'Token inválido o expirado' });
  }
});

module.exports = router;
