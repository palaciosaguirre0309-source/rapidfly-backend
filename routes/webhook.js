// ============================================================
// RUTAS: Webhook
// Recibe mensajes de Evolution API y los procesa con Claude
// ============================================================

const express = require('express');
const router  = express.Router();
const axios   = require('axios');

// POST /api/webhook/whatsapp — recibe mensajes de Evolution API
router.post('/whatsapp', async (req, res) => {
  // Responder inmediatamente a Evolution API
  res.json({ ok: true });

  try {
    const body = req.body;

    // Verificar que sea un mensaje nuevo
    if (body.event !== 'messages.upsert') return;
    if (!body.data?.message?.conversation) return;

    const texto     = body.data.message.conversation;
    const telefono  = body.data.key.remoteJid.replace('@s.whatsapp.net', '');
    const nombre_comercio = body.data.pushName || 'Desconocido';

    // Filtrar solo mensajes de pedidos
    if (!texto.includes('Detalles del Pedido') && 
        !texto.includes('detalles del pedido')) return;

    console.log(`📩 Pedido recibido de ${nombre_comercio} (${telefono})`);

    // ── Paso 1: Parsear con Claude API ──────────────────────
    const pedidoParseado = await parsearConClaude(texto, nombre_comercio);
    if (!pedidoParseado) {
      console.error('❌ Error parseando pedido con Claude');
      await enviarMensaje(telefono, 
        '⚠️ No pude procesar el pedido. Por favor reenvíalo.');
      return;
    }

    // ── Paso 2: Buscar o crear el comercio ──────────────────
    let comercio = await buscarComercio(req.db, telefono);
    if (!comercio) {
      const r = await req.db.query(
        `INSERT INTO comercios (nombre, telefono) 
         VALUES ($1, $2) RETURNING *`,
        [nombre_comercio, '+' + telefono]
      );
      comercio = r.rows[0];
      console.log(`🏪 Nuevo comercio creado: ${nombre_comercio}`);
    }

    // ── Paso 3: Crear el pedido en BD ───────────────────────
    const mes = new Date().toISOString().slice(0, 7);
    const r = await req.db.query(
      `INSERT INTO pedidos (
        comercio_id, nombre_cliente, telefono_cliente,
        monto_cobrar, vuelto, costo_delivery,
        ubicacion_lat, ubicacion_lng, direccion_texto,
        minutos_preparacion, mensaje_original
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        comercio.id,
        pedidoParseado.nombre_cliente,
        pedidoParseado.telefono_cliente,
        pedidoParseado.monto_cobrar || 0,
        pedidoParseado.vuelto || 0,
        pedidoParseado.costo_delivery || 0,
        pedidoParseado.ubicacion_lat,
        pedidoParseado.ubicacion_lng,
        pedidoParseado.direccion_texto,
        pedidoParseado.minutos_preparacion || 0,
        texto
      ]
    );
    const pedido = r.rows[0];

    // Registrar en facturación del comercio
    await req.db.query(
      `INSERT INTO facturacion_comercios 
       (comercio_id, pedido_id, monto_delivery, mes)
       VALUES ($1,$2,$3,$4)`,
      [comercio.id, pedido.id, pedido.costo_delivery, mes]
    );

    // ── Paso 4: Buscar operador disponible ──────────────────
    const opResult = await req.db.query(
      `SELECT * FROM operadores 
       WHERE disponible=true AND activo=true 
       ORDER BY created_at ASC LIMIT 1`
    );

    if (opResult.rows.length === 0) {
      // Sin operadores — notificar al comercio y al admin
      console.warn('⚠️ Sin operadores disponibles');
      await enviarMensaje(telefono,
        `⚠️ Pedido recibido para *${pedidoParseado.nombre_cliente}* pero no hay operadores disponibles en este momento. Te avisamos cuando se asigne.`
      );
      req.io.to('admin').emit('pedido:sin_operador', pedido);
      return;
    }

    const operador = opResult.rows[0];

    // ── Paso 5: Asignar operador ────────────────────────────
    await req.db.query(
      `UPDATE pedidos SET 
        operador_id=$1, estado='asignado', hora_asignado=NOW()
       WHERE id=$2`,
      [operador.id, pedido.id]
    );
    await req.db.query(
      `UPDATE operadores SET disponible=false WHERE id=$1`,
      [operador.id]
    );

    // ── Paso 6: Notificar al operador por WhatsApp ──────────
    const msgOperador = formatearMensajeOperador(pedidoParseado, pedido.id);
    await enviarMensaje(operador.telefono.replace('+', ''), msgOperador);

    // ── Paso 7: Confirmar al comercio ───────────────────────
    await enviarMensaje(telefono,
      `✅ Pedido de *${pedidoParseado.nombre_cliente}* asignado a *${operador.nombre}*.\n` +
      `🏍️ Estará en camino en aproximadamente ${pedidoParseado.minutos_preparacion} minutos.`
    );

    // ── Paso 8: Notificar al panel admin ────────────────────
    req.io.to('admin').emit('pedido:nuevo', {
      ...pedido,
      operador_nombre: operador.nombre,
      comercio_nombre: nombre_comercio
    });

    console.log(`✅ Pedido asignado a ${operador.nombre}`);

  } catch (err) {
    console.error('❌ Error procesando webhook:', err.message);
  }
});

// ── HELPERS ─────────────────────────────────────────────────

async function parsearConClaude(texto, nombre_comercio) {
  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Eres un asistente que extrae datos de pedidos de delivery en Venezuela.
Analiza el siguiente mensaje y devuelve SOLO un JSON válido sin texto adicional, 
sin comillas de código, sin explicaciones.

Mensaje del comercio "${nombre_comercio}":
${texto}

Devuelve exactamente este JSON con los valores extraídos:
{
  "nombre_cliente": "string o null",
  "telefono_cliente": "string o null",
  "monto_cobrar": 0.00,
  "vuelto": 0.00,
  "costo_delivery": 0.00,
  "minutos_preparacion": 0,
  "direccion_texto": "string o null",
  "ubicacion_lat": null,
  "ubicacion_lng": null
}

Reglas:
- Los montos pueden venir con $ o € pero trátalos siempre como dólares
- Si dice "Cobrar $" sin monto, usa 0
- Si no hay vuelto, usa 0
- El teléfono puede estar en formato venezolano: 0414, 0424, +58414, etc
- Si hay coordenadas GPS en el texto, extráelas en lat y lng
- Si no hay un campo, usa null o 0 según corresponda
- Pueden haber errores ortográficos, interprétalos con contexto venezolano`
        }]
      },
      {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        }
      }
    );

    const contenido = response.data.content[0].text.trim();
    return JSON.parse(contenido);

  } catch (err) {
    console.error('❌ Error Claude API:', err.message);
    return null;
  }
}

async function buscarComercio(db, telefono) {
  const formatos = [
    telefono,
    '+' + telefono,
    '0' + telefono.slice(2)
  ];
  const r = await db.query(
    `SELECT * FROM comercios WHERE telefono = ANY($1) AND activo=true`,
    [formatos]
  );
  return r.rows[0] || null;
}

async function enviarMensaje(telefono, mensaje) {
  try {
    await axios.post(
      `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
      {
        number: telefono,
        text: mensaje
      },
      {
        headers: {
          'apikey': process.env.EVOLUTION_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (err) {
    console.error('❌ Error enviando WhatsApp:', err.message);
  }
}

function formatearMensajeOperador(pedido, pedido_id) {
  return `🏍️ *NUEVO PEDIDO ASIGNADO*\n\n` +
    `👤 Cliente: *${pedido.nombre_cliente}*\n` +
    `📞 Teléfono: ${pedido.telefono_cliente || 'No indicado'}\n` +
    `💵 Cobrar: $${pedido.monto_cobrar}\n` +
    `💸 Vuelto: $${pedido.vuelto}\n` +
    `🚚 Delivery: $${pedido.costo_delivery}\n` +
    `📍 Dirección: ${pedido.direccion_texto || 'Ver ubicación'}\n` +
    `⏱️ Listo en: ${pedido.minutos_preparacion} min\n\n` +
    `🔗 App: ${process.env.PUBLIC_URL}/operador\n` +
    `ID: ${pedido_id}`;
}

module.exports = router;
