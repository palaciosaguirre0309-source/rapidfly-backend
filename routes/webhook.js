// ============================================================
// RUTAS: Webhook
// Recibe mensajes de Evolution API y los procesa con Claude
// ============================================================

const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const webpush = require('../lib/webpush');

// ── Estado de conversaciones pendientes ────────────────────────────────────────
// Clave: teléfono del comercio  →  { pedidoParcial, esperando, ts }
const conversaciones = new Map();
const CONV_TTL = 15 * 60 * 1000; // 15 minutos de timeout

function limpiarExpiradas() {
  const ahora = Date.now();
  for (const [k, v] of conversaciones) {
    if (ahora - v.ts > CONV_TTL) conversaciones.delete(k);
  }
}

// ── POST /api/webhook/whatsapp ─────────────────────────────────────────────────
router.post('/whatsapp', async (req, res) => {
  // Responder inmediatamente a Evolution API (evita reenvíos por timeout)
  res.json({ ok: true });

  try {
    const body = req.body;
    if (body.event !== 'messages.upsert') return;

    const msg = body.data?.message;
    if (!msg) return;

    const telefono   = body.data.key.remoteJid.replace('@s.whatsapp.net', '');
    const nombre_com = body.data.pushName || 'Desconocido';

    // ── Extraer texto y/o pin de ubicación GPS ──
    const texto = msg.conversation
               || msg.extendedTextMessage?.text
               || msg.imageMessage?.caption
               || msg.videoMessage?.caption
               || '';

    // Soporte de pines de ubicación de WhatsApp (📍)
    const gpsRecibido = msg.locationMessage
      ? {
          lat: msg.locationMessage.degreesLatitude,
          lng: msg.locationMessage.degreesLongitude
        }
      : null;

    if (!texto && !gpsRecibido) return;

    limpiarExpiradas();

    // Buscar o preparar comercio
    let comercio = await buscarComercio(req.db, telefono);

    // Conversación pendiente de este número
    const conv = conversaciones.get(telefono);

    // ══════════════════════════════════════════════════════════
    // CASO A: El comercio envió un PIN de ubicación GPS
    // ══════════════════════════════════════════════════════════
    if (gpsRecibido) {
      if (!conv) {
        // Ubicación sin contexto previo → pedir que describan el pedido
        await enviarMensaje(telefono,
          '📍 Recibí tu ubicación. Para procesar un pedido escríbeme los datos:\n' +
          'nombre del cliente, lo que debe cobrar y tiempo de preparación.\n' +
          'La dirección la tomamos del pin que enviaste. 🏍️'
        );
        // Guardar la ubicación como contexto inicial
        conversaciones.set(telefono, {
          pedidoParcial: {
            ubicacion_lat: gpsRecibido.lat,
            ubicacion_lng: gpsRecibido.lng,
            direccion_texto: `📍 GPS: ${gpsRecibido.lat.toFixed(5)}, ${gpsRecibido.lng.toFixed(5)}`
          },
          esperando: 'datos_pedido',
          ts: Date.now()
        });
        return;
      }

      // Había una conv pendiente esperando la dirección → enriquecer y continuar
      conv.pedidoParcial.ubicacion_lat = gpsRecibido.lat;
      conv.pedidoParcial.ubicacion_lng = gpsRecibido.lng;
      if (!conv.pedidoParcial.direccion_texto) {
        conv.pedidoParcial.direccion_texto =
          `📍 GPS: ${gpsRecibido.lat.toFixed(5)}, ${gpsRecibido.lng.toFixed(5)}`;
      }
      conv.ts = Date.now();

      if (!comercio) comercio = await crearComercio(req.db, nombre_com, telefono);
      await aplicarTarifaAuto(req.db, conv.pedidoParcial, comercio);
      await resolverConversacion(req, telefono, nombre_com, conv, comercio);
      return;
    }

    // ══════════════════════════════════════════════════════════
    // CASO B: El comercio envió texto — analizar con Claude
    // ══════════════════════════════════════════════════════════
    const analisis = await analizarConClaude(
      texto,
      nombre_com,
      conv?.pedidoParcial || null
    );

    if (!analisis) {
      await enviarMensaje(telefono,
        '⚠️ No pude procesar tu mensaje. Por favor inténtalo de nuevo.'
      );
      return;
    }

    // ── Consulta de tarifas ──
    if (analisis.tipo === 'consulta_tarifa') {
      const tarifas = await obtenerTarifas(req.db);
      await enviarMensaje(telefono, formatearTarifas(tarifas));
      return;
    }

    // ── Mensaje irrelevante y sin contexto previo → ignorar ──
    if (analisis.tipo === 'otro') {
      return;
    }

    // ── Pedido nuevo o respuesta a pregunta pendiente ──
    let pedidoParcial;

    if (conv && (analisis.tipo === 'pedido' || analisis.tipo === 'respuesta')) {
      // Fusionar datos nuevos con el pedido parcial previo
      pedidoParcial = mergePedido(conv.pedidoParcial, analisis);
    } else if (analisis.tipo === 'pedido') {
      const { tipo, ...datos } = analisis;
      pedidoParcial = datos;
    } else {
      // 'respuesta' sin contexto → ignorar
      return;
    }

    // Aplicar tiempo por defecto
    if (!pedidoParcial.minutos_preparacion) pedidoParcial.minutos_preparacion = 20;

    if (!comercio) comercio = await crearComercio(req.db, nombre_com, telefono);

    // Auto-asignar tarifa si el comercio tiene zona configurada
    await aplicarTarifaAuto(req.db, pedidoParcial, comercio);

    // Actualizar (o crear) la conversación con los datos acumulados
    conversaciones.set(telefono, { pedidoParcial, esperando: null, ts: Date.now() });

    await resolverConversacion(
      req, telefono, nombre_com,
      conversaciones.get(telefono),
      comercio
    );

  } catch (err) {
    console.error('❌ Error procesando webhook:', err.message);
  }
});

// ── RESOLVER CONVERSACIÓN ──────────────────────────────────────────────────────
// Verifica si el pedido está completo; si no, pide el campo faltante (1 pregunta)
async function resolverConversacion(req, telefono, nombre_com, conv, comercio) {
  const pedido   = conv.pedidoParcial;
  const faltante = detectarFaltante(pedido, comercio);

  if (faltante) {
    conv.esperando = faltante.campo;
    conv.ts        = Date.now();
    await enviarMensaje(telefono, faltante.pregunta);
    return;
  }

  // Todo completo → crear pedido
  conversaciones.delete(telefono);
  await crearPedidoYNotificar(req, pedido, comercio, nombre_com, telefono);
}

// ── DETECTAR CAMPO FALTANTE ───────────────────────────────────────────────────
// Devuelve { campo, pregunta } si algo crítico falta; null si está completo
function detectarFaltante(pedido, comercio) {
  if (!pedido.nombre_cliente) {
    return {
      campo: 'nombre_cliente',
      pregunta: '¿Cuál es el *nombre del cliente* al que entregamos?'
    };
  }

  if (!pedido.direccion_texto && !pedido.ubicacion_lat) {
    return {
      campo: 'direccion_texto',
      pregunta:
        '¿A qué *dirección entregamos*?\n' +
        'Puedes escribirla o enviar 📍 la ubicación por WhatsApp.'
    };
  }

  // monto_cobrar: null/undefined = no especificado; 0 = ya pagó (válido)
  if (pedido.monto_cobrar === null || pedido.monto_cobrar === undefined) {
    return {
      campo: 'monto_cobrar',
      pregunta:
        '💵 ¿Cuánto debe *cobrarle al cliente*?\n' +
        'Ejemplo: _$15_. Si ya pagó escribe *0*.'
    };
  }

  // Delivery: si el comercio no tiene zona asignada y no vino en el mensaje
  if ((!pedido.costo_delivery || pedido.costo_delivery === 0) && !comercio.tarifa_zona) {
    return {
      campo: 'costo_delivery',
      pregunta:
        '💸 ¿Cuál es el *costo del delivery*?\n\n' +
        'Puedes indicar la zona:\n' +
        '📍 *Zona 1* (cercana): $1.50\n' +
        '📍 *Zona 2* (media): $2.50\n' +
        '📍 *Zona 3* (lejana): $3.50\n' +
        '📍 *Zona 4* (muy lejana): $5.00'
    };
  }

  return null;
}

// ── CREAR PEDIDO Y NOTIFICAR ──────────────────────────────────────────────────
async function crearPedidoYNotificar(req, datos, comercio, nombre_com, telefono) {
  const mes = new Date().toISOString().slice(0, 7);

  const r = await req.db.query(
    `INSERT INTO pedidos (
       comercio_id, nombre_cliente, telefono_cliente,
       monto_cobrar, vuelto, costo_delivery,
       ubicacion_lat, ubicacion_lng, direccion_texto,
       minutos_preparacion, mensaje_original
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [
      comercio.id,
      datos.nombre_cliente,
      datos.telefono_cliente  || null,
      datos.monto_cobrar      ?? 0,
      datos.vuelto            || 0,
      datos.costo_delivery    || 0,
      datos.ubicacion_lat     || null,
      datos.ubicacion_lng     || null,
      datos.direccion_texto   || null,
      datos.minutos_preparacion || 20,
      'Pedido procesado por RapiFly IA'
    ]
  );
  const pedido = r.rows[0];

  // Registrar en facturación del comercio
  await req.db.query(
    `INSERT INTO facturacion_comercios (comercio_id, pedido_id, monto_delivery, mes)
     VALUES ($1,$2,$3,$4)`,
    [comercio.id, pedido.id, pedido.costo_delivery, mes]
  );

  // ── Buscar operadores disponibles ──
  const opResult = await req.db.query(
    `SELECT * FROM operadores WHERE disponible=true AND activo=true ORDER BY created_at ASC`
  );

  if (opResult.rows.length === 0) {
    console.warn('⚠️ Sin operadores disponibles');
    await enviarMensaje(telefono,
      `⚠️ Pedido de *${pedido.nombre_cliente}* recibido, ` +
      `pero no hay operadores disponibles ahora. Te avisamos cuando se asigne. 🏍️`
    );
    req.io.to('admin').emit('pedido:sin_operador', pedido);
    return;
  }

  // ── Notificar a TODOS los operadores disponibles (primero en aceptar lo toma) ──
  const pedidoParaOp  = { ...pedido, comercio_nombre: nombre_com };
  const pushPayload   = JSON.stringify({
    title:           '🏍️ ¡Nuevo pedido!',
    body:            `${pedido.nombre_cliente} · $${pedido.costo_delivery} delivery · ${pedido.direccion_texto || 'Ver ubicación en app'}`,
    pedido_id:       pedido.id,
    nombre_cliente:  pedido.nombre_cliente,
    direccion_texto: pedido.direccion_texto,
    monto_cobrar:    pedido.monto_cobrar,
    costo_delivery:  pedido.costo_delivery,
    comercio_nombre: nombre_com
  });

  for (const op of opResult.rows) {
    req.io.to(`operador:${op.id}`).emit('pedido:disponible', pedidoParaOp);
    if (op.push_subscription && process.env.VAPID_PUBLIC_KEY) {
      webpush.sendNotification(op.push_subscription, pushPayload)
        .catch(err => {
          if (err.statusCode === 410 || err.statusCode === 404) {
            req.db.query('UPDATE operadores SET push_subscription=NULL WHERE id=$1', [op.id]);
          }
          console.error(`❌ Push op ${op.id}:`, err.message);
        });
    }
  }

  // ── Confirmar al comercio con resumen del pedido ──
  await enviarMensaje(telefono,
    `✅ *Pedido recibido*\n\n` +
    `👤 Cliente: *${pedido.nombre_cliente}*\n` +
    (pedido.telefono_cliente ? `📞 Tel: ${pedido.telefono_cliente}\n` : '') +
    `📍 Dirección: ${pedido.direccion_texto || '📍 Ubicación GPS enviada'}\n` +
    `💵 Cobrar: $${parseFloat(pedido.monto_cobrar).toFixed(2)}\n` +
    `🚚 Delivery: $${parseFloat(pedido.costo_delivery).toFixed(2)}\n` +
    `⏱️ Listo en: ${pedido.minutos_preparacion} min\n\n` +
    `Asignando operador... 🏍️`
  );

  // ── Notificar panel admin ──
  req.io.to('admin').emit('pedido:nuevo', { ...pedido, comercio_nombre: nombre_com });
  console.log(`📡 Pedido ${pedido.id} notificado a ${opResult.rows.length} operador(es)`);
}

// ── ANALIZAR CON CLAUDE (extractor JSON estricto) ─────────────────────────────
async function analizarConClaude(texto, nombre_comercio, contextoPrevio) {
  const systemPrompt = `Eres un extractor de datos backend para RapiFly, un sistema de delivery en Venezuela.
Tu ÚNICA función: analizar mensajes de WhatsApp de comercios y devolver un objeto JSON puro.
NUNCA agregues prosa, explicaciones ni bloques de código. Solo el JSON crudo.

══ TIPOS DE RESPUESTA ══

1. Pedido de delivery (texto completo o parcial con datos del pedido):
{
  "tipo": "pedido",
  "nombre_cliente": "string o null",
  "telefono_cliente": "string o null",
  "direccion_texto": "string completa o null",
  "monto_cobrar": número_decimal o null,
  "vuelto": número_decimal o 0,
  "costo_delivery": número_decimal o 0,
  "minutos_preparacion": número_entero o 20,
  "ubicacion_lat": número o null,
  "ubicacion_lng": número o null
}

2. Consulta sobre precios o tarifas de delivery:
{ "tipo": "consulta_tarifa" }

3. Respuesta a una pregunta previa del sistema (nombre, dirección, monto, etc.):
{
  "tipo": "respuesta",
  "nombre_cliente": "string o null",
  "telefono_cliente": "string o null",
  "direccion_texto": "string o null",
  "monto_cobrar": número o null,
  "costo_delivery": número o null,
  "minutos_preparacion": número o null,
  "ubicacion_lat": número o null,
  "ubicacion_lng": número o null,
  "vuelto": número o null
}

4. Cualquier otra cosa (saludo, confirmación vacía, etc.):
{ "tipo": "otro" }

══ REGLAS DE EXTRACCIÓN ══
- Montos: ignora símbolo ($, Bs, USD). "cobrar $15" → monto_cobrar: 15
- "delivery X" / "envío X" / "despacho X" → costo_delivery: X
- "cobrar" sin monto → monto_cobrar: null (NUNCA 0 si no se especifica)
- "ya pagó" / "no cobrar" / "pagó online" → monto_cobrar: 0
- Teléfonos venezolanos (04XX, +584XX, 58414...) → string completo
- Coordenadas GPS en texto (10.24, -67.88) → extraer en lat/lng
- "Listo en X min" / "en X minutos" / "en X" → minutos_preparacion: X
- Sin tiempo especificado → minutos_preparacion: 20
- Errores ortográficos venezolanos: "direcion"=dirección, "cobral"=cobrar
- Un mensaje con solo nombre y dirección (sin monto) ES tipo "pedido"
- El campo "vuelto" es el cambio que da el operador; si no se menciona → 0`;

  const userContent = contextoPrevio
    ? `Pedido en proceso (datos ya recopilados):\n${JSON.stringify(contextoPrevio, null, 2)}\n\nNuevo mensaje de "${nombre_comercio}":\n${texto}`
    : `Mensaje de "${nombre_comercio}":\n${texto}`;

  try {
    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model:      'claude-haiku-4-5-20251001', // rápido y económico para extracción
        max_tokens: 400,
        system:     systemPrompt,
        messages:   [{ role: 'user', content: userContent }]
      },
      {
        headers: {
          'x-api-key':          process.env.ANTHROPIC_API_KEY,
          'anthropic-version':  '2023-06-01',
          'content-type':       'application/json'
        }
      }
    );

    const raw = response.data.content[0].text
      .trim()
      .replace(/^```(?:json)?\n?/, '')
      .replace(/\n?```$/, '');

    return JSON.parse(raw);
  } catch (err) {
    console.error('❌ Claude API error:', err.response?.data?.error?.message || err.message);
    return null;
  }
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

// Fusiona datos nuevos con el pedido parcial previo (sin sobrescribir con null)
function mergePedido(base, nuevo) {
  const merged = { ...base };
  const campos = [
    'nombre_cliente', 'telefono_cliente', 'direccion_texto',
    'ubicacion_lat', 'ubicacion_lng',
    'monto_cobrar', 'vuelto', 'costo_delivery', 'minutos_preparacion'
  ];
  for (const c of campos) {
    if (nuevo[c] !== null && nuevo[c] !== undefined && nuevo[c] !== '') {
      merged[c] = nuevo[c];
    }
  }
  return merged;
}

// Aplica tarifa automática desde la zona pre-configurada del comercio
async function aplicarTarifaAuto(db, pedido, comercio) {
  if ((!pedido.costo_delivery || pedido.costo_delivery === 0) && comercio.tarifa_zona) {
    const tarifas = await obtenerTarifas(db);
    const monto   = parseFloat(tarifas[comercio.tarifa_zona]);
    if (monto > 0) {
      pedido.costo_delivery = monto;
      console.log(`💡 Tarifa auto: ${comercio.nombre} → $${monto} (${comercio.tarifa_zona})`);
    }
  }
}

async function crearComercio(db, nombre, telefono) {
  const r = await db.query(
    `INSERT INTO comercios (nombre, telefono) VALUES ($1, $2) RETURNING *`,
    [nombre, '+' + telefono]
  );
  console.log(`🏪 Nuevo comercio: ${nombre} (${telefono})`);
  return r.rows[0];
}

async function buscarComercio(db, telefono) {
  const formatos = [telefono, '+' + telefono, '0' + telefono.slice(2)];
  const r = await db.query(
    `SELECT * FROM comercios WHERE telefono = ANY($1) AND activo=true`,
    [formatos]
  );
  return r.rows[0] || null;
}

async function obtenerTarifas(db) {
  try {
    const r = await db.query(
      `SELECT clave, valor FROM configuracion WHERE clave LIKE 'tarifa_zona%'`
    );
    const cfg = {};
    r.rows.forEach(row => { cfg[row.clave] = row.valor; });
    return {
      zona1: cfg['tarifa_zona1'] || process.env.TARIFA_ZONA1 || '1.50',
      zona2: cfg['tarifa_zona2'] || process.env.TARIFA_ZONA2 || '2.50',
      zona3: cfg['tarifa_zona3'] || process.env.TARIFA_ZONA3 || '3.50',
      zona4: cfg['tarifa_zona4'] || process.env.TARIFA_ZONA4 || '5.00'
    };
  } catch {
    return { zona1: '1.50', zona2: '2.50', zona3: '3.50', zona4: '5.00' };
  }
}

function formatearTarifas(tarifas) {
  return (
    `📋 *Tarifas RapiFly* 🏍️\n\n` +
    `📍 *Zona 1* (cercana): $${tarifas.zona1}\n` +
    `📍 *Zona 2* (media): $${tarifas.zona2}\n` +
    `📍 *Zona 3* (lejana): $${tarifas.zona3}\n` +
    `📍 *Zona 4* (muy lejana): $${tarifas.zona4}\n\n` +
    `Para asignarte una tarifa fija contáctanos. ✅`
  );
}

async function enviarMensaje(telefono, mensaje) {
  try {
    await axios.post(
      `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
      { number: telefono, text: mensaje },
      {
        headers: {
          'apikey':        process.env.EVOLUTION_API_KEY,
          'Content-Type':  'application/json'
        }
      }
    );
  } catch (err) {
    console.error('❌ Error enviando WhatsApp:', err.message);
  }
}

module.exports = router;
