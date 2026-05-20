// ============================================================
// RUTAS: Pedidos
// ============================================================

const express = require('express');
const router  = express.Router();

// GET /api/pedidos — listar pedidos activos
router.get('/', async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT * FROM v_pedidos_activos ORDER BY hora_creacion DESC`
    );
    res.json({ ok: true, data: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/pedidos/operador/:operador_id — pedido activo del operador
router.get('/operador/:operador_id', async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT p.*, c.nombre AS comercio_nombre, c.telefono AS comercio_telefono
       FROM pedidos p
       LEFT JOIN comercios c ON p.comercio_id = c.id
       WHERE p.operador_id = $1 AND p.estado IN ('asignado', 'en_camino')
       ORDER BY p.hora_asignado DESC LIMIT 1`,
      [req.params.operador_id]
    );
    res.json({ ok: true, data: result.rows[0] || null });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/pedidos/:id — detalle de un pedido
router.get('/:id', async (req, res) => {
  try {
    const result = await req.db.query(
      `SELECT * FROM v_pedidos_activos WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0)
      return res.status(404).json({ ok: false, error: 'Pedido no encontrado' });
    res.json({ ok: true, data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/pedidos — crear pedido nuevo
router.post('/', async (req, res) => {
  const {
    comercio_id, nombre_cliente, telefono_cliente,
    monto_cobrar, vuelto, costo_delivery,
    ubicacion_lat, ubicacion_lng, direccion_texto,
    minutos_preparacion, mensaje_original
  } = req.body;

  try {
    const result = await req.db.query(
      `INSERT INTO pedidos (
        comercio_id, nombre_cliente, telefono_cliente,
        monto_cobrar, vuelto, costo_delivery,
        ubicacion_lat, ubicacion_lng, direccion_texto,
        minutos_preparacion, mensaje_original
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        comercio_id, nombre_cliente, telefono_cliente,
        monto_cobrar || 0, vuelto || 0, costo_delivery,
        ubicacion_lat, ubicacion_lng, direccion_texto,
        minutos_preparacion || 0, mensaje_original
      ]
    );

    const pedido = result.rows[0];

    // Notificar al panel admin via WebSocket
    req.io.to('admin').emit('pedido:nuevo', pedido);

    // Registrar en facturación del comercio
    if (comercio_id) {
      const mes = new Date().toISOString().slice(0, 7);
      await req.db.query(
        `INSERT INTO facturacion_comercios (comercio_id, pedido_id, monto_delivery, mes)
         VALUES ($1, $2, $3, $4)`,
        [comercio_id, pedido.id, costo_delivery, mes]
      );
    }

    res.status(201).json({ ok: true, data: pedido });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// PATCH /api/pedidos/:id/estado — cambiar estado manualmente
router.patch('/:id/estado', async (req, res) => {
  const { estado, operador_id } = req.body;
  const estados_validos = ['pendiente','asignado','en_camino','entregado','cancelado'];

  if (!estados_validos.includes(estado))
    return res.status(400).json({ ok: false, error: 'Estado inválido' });

  try {
    let campos = 'estado = $1';
    let params = [estado, req.params.id];

    if (estado === 'asignado')      campos += ', hora_asignado = NOW()';
    if (estado === 'en_camino')     campos += ', hora_tomado = NOW()';
    if (estado === 'entregado')     campos += ', hora_entregado = NOW()';

    const result = await req.db.query(
      `UPDATE pedidos SET ${campos} WHERE id = $2 RETURNING *`,
      params
    );

    const pedido = result.rows[0];

    // Si se entrega: sumar balance y liberar operador
    if (estado === 'entregado' && pedido.operador_id) {
      const semana = getSemana();
      await req.db.query(
        `INSERT INTO balance_operadores (operador_id, pedido_id, monto, semana)
         VALUES ($1, $2, $3, $4)`,
        [pedido.operador_id, pedido.id, pedido.costo_delivery, semana]
      );
      await req.db.query(
        `UPDATE operadores SET disponible=true WHERE id=$1`,
        [pedido.operador_id]
      );
    }

    // Notificar via WebSocket
    req.io.to(`pedido:${pedido.id}`).emit('pedido:estado', { 
      pedido_id: pedido.id, estado 
    });
    req.io.to('admin').emit('pedido:estado', { 
      pedido_id: pedido.id, estado 
    });

    res.json({ ok: true, data: pedido });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// DELETE /api/pedidos/:id — cancelar pedido
router.delete('/:id', async (req, res) => {
  try {
    await req.db.query(
      `UPDATE pedidos SET estado='cancelado' WHERE id=$1`,
      [req.params.id]
    );
    res.json({ ok: true, message: 'Pedido cancelado' });
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
