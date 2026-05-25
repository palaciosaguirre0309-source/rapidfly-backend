require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const { Pool }   = require('pg');
const path       = require('path');
const axios      = require('axios');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false
});

db.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.message);
  } else {
    console.log('✅ PostgreSQL conectado');
    release();
  }
});

app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  req.db = db;
  req.io = io;
  next();
});

app.use('/api/pedidos',    require('./routes/pedidos'));
app.use('/api/operadores', require('./routes/operadores'));
app.use('/api/tracking',   require('./routes/tracking'));
app.use('/api/balance',    require('./routes/balance'));
app.use('/api/reportes',   require('./routes/reportes'));
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/webhook',    require('./routes/webhook'));
app.use('/api/config',     require('./routes/config'));
app.use('/api/comercios',  require('./routes/comercios'));

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/push/vapid-key', (req, res) => {
  res.json({ ok: true, key: process.env.VAPID_PUBLIC_KEY || null });
});

app.use('/admin',    express.static(path.join(__dirname, 'admin')));
app.use('/comercio', express.static(path.join(__dirname, 'comercio')));
app.get('/comercio', (req, res) => res.sendFile(path.join(__dirname, 'comercio', 'index.html')));
app.use(express.static(path.join(__dirname, 'pwa-operador')));

app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'pwa-operador', 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.json({ status: 'ok', message: 'RapidFly API funcionando' });
  }
});

const operadoresConectados = new Map();

io.on('connection', (socket) => {
  socket.on('operador:identificar', (data) => {
    operadoresConectados.set(data.operador_id, socket.id);
    socket.operador_id = data.operador_id;
    socket.join(`operador:${data.operador_id}`);
  });

  socket.on('operador:posicion', async (data) => {
    const { operador_id, pedido_id, lat, lng } = data;
    try {
      await db.query(
        'INSERT INTO tracking (pedido_id, operador_id, lat, lng) VALUES ($1,$2,$3,$4)',
        [pedido_id, operador_id, lat, lng]
      );
      // Actualizar última posición conocida del operador
      await db.query(
        `UPDATE operadores SET ultima_lat=$1, ultima_lng=$2, ultima_posicion=NOW() WHERE id=$3`,
        [lat, lng, operador_id]
      );
      io.to(`pedido:${pedido_id}`).emit('operador:posicion', { operador_id, lat, lng, timestamp: new Date().toISOString() });
      io.to('admin').emit('operador:posicion', { operador_id, pedido_id, lat, lng, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('❌ Error guardando tracking:', err.message);
    }
  });

  // Posición libre (operador sin pedido activo)
  socket.on('operador:posicion_libre', async (data) => {
    const { operador_id, lat, lng } = data;
    try {
      await db.query(
        `UPDATE operadores SET ultima_lat=$1, ultima_lng=$2, ultima_posicion=NOW() WHERE id=$3`,
        [lat, lng, operador_id]
      );
      io.to('admin').emit('operador:posicion_libre', { operador_id, lat, lng, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('❌ Error actualizando posición libre:', err.message);
    }
  });

  socket.on('comercio:identificar', (data) => {
    socket.join(`comercio:${data.comercio_id}`);
  });

  socket.on('tracking:unirse', (data) => {
    socket.join(`pedido:${data.pedido_id}`);
  });

  socket.on('admin:unirse', () => {
    socket.join('admin');
    socket.emit('admin:operadores_activos', Array.from(operadoresConectados.keys()));
  });

  socket.on('pedido:estado', async (data) => {
    const { pedido_id, estado, operador_id } = data;
    try {
      let query = '';
      if (estado === 'en_camino') {
        query = "UPDATE pedidos SET estado='en_camino', hora_tomado=NOW() WHERE id=$1 RETURNING *";
      } else if (estado === 'entregado') {
        query = "UPDATE pedidos SET estado='entregado', hora_entregado=NOW() WHERE id=$1 RETURNING *";
      }
      const result = await db.query(query, [pedido_id]);
      const pedido = result.rows[0];
      io.to(`pedido:${pedido_id}`).emit('pedido:estado', { pedido_id, estado, timestamp: new Date().toISOString() });
      io.to('admin').emit('pedido:estado', { pedido_id, estado, operador_id, timestamp: new Date().toISOString() });
      if (pedido?.comercio_id) {
        io.to(`comercio:${pedido.comercio_id}`).emit('pedido:actualizado', { pedido_id, estado });
      }
      if (estado === 'entregado' && pedido) {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        const week = Math.ceil((((now - start) / 86400000) + start.getDay() + 1) / 7);
        const semana = `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
        const opRes  = await db.query(`SELECT porcentaje_ganancia FROM operadores WHERE id=$1`, [operador_id]);
        const pct    = (opRes.rows[0]?.porcentaje_ganancia ?? 75) / 100;
        const monto_op  = parseFloat((pedido.costo_delivery * pct).toFixed(2));
        const monto_emp = parseFloat((pedido.costo_delivery * (1 - pct)).toFixed(2));
        await db.query(
          'INSERT INTO balance_operadores (operador_id, pedido_id, monto, monto_empresa, semana) VALUES ($1,$2,$3,$4,$5)',
          [operador_id, pedido_id, monto_op, monto_emp, semana]
        );
        await db.query('UPDATE operadores SET disponible=true WHERE id=$1', [operador_id]);
      }
    } catch (err) {
      console.error('❌ Error actualizando estado:', err.message);
    }
  });

  // El primer operador que toca "Aceptar" se lleva el pedido
  socket.on('pedido:aceptar', async ({ pedido_id, operador_id }) => {
    try {
      // UPDATE atómico: solo funciona si el pedido sigue pendiente sin operador
      const result = await db.query(
        `UPDATE pedidos SET operador_id=$1, estado='asignado', hora_asignado=NOW()
         WHERE id=$2 AND estado='pendiente' AND operador_id IS NULL
         RETURNING *`,
        [operador_id, pedido_id]
      );

      if (!result.rows.length) {
        // Otro operador llegó primero
        socket.emit('pedido:ya_tomado', { pedido_id });
        return;
      }

      const pedido = result.rows[0];
      await db.query(`UPDATE operadores SET disponible=false WHERE id=$1`, [operador_id]);

      const [opRes, comRes] = await Promise.all([
        db.query(`SELECT * FROM operadores WHERE id=$1`, [operador_id]),
        db.query(`SELECT * FROM comercios WHERE id=$1`, [pedido.comercio_id])
      ]);
      const operador = opRes.rows[0];
      const comercio = comRes.rows[0];

      // Confirmar al operador que aceptó
      socket.emit('pedido:aceptado_confirmado', {
        ...pedido,
        comercio_nombre: comercio?.nombre
      });

      // Avisar a todos los demás operadores que el pedido ya fue tomado
      io.emit('pedido:tomado', { pedido_id });

      // Notificar al portal del comercio
      io.to(`comercio:${pedido.comercio_id}`).emit('pedido:actualizado', {
        pedido_id,
        estado: 'asignado',
        operador_nombre: operador?.nombre,
        operador_telefono: operador?.telefono
      });

      // Actualizar admin
      io.to('admin').emit('pedido:estado', {
        pedido_id, estado: 'asignado',
        operador_id, operador_nombre: operador?.nombre
      });

      // WhatsApp al operador ganador con detalles del pedido
      if (operador) {
        const pct_op = ((operador?.porcentaje_ganancia ?? 75) / 100);
        const ganancia = parseFloat((pedido.costo_delivery * pct_op).toFixed(2));
        let mapsLink = '';
        if (pedido.ubicacion_lat && pedido.ubicacion_lng) {
          mapsLink = `\n🗺️ Maps: https://www.google.com/maps?q=${pedido.ubicacion_lat},${pedido.ubicacion_lng}`;
        } else if (pedido.direccion_texto) {
          mapsLink = `\n🗺️ Maps: https://www.google.com/maps/search/?q=${encodeURIComponent(pedido.direccion_texto)}`;
        }
        await enviarWA(operador.telefono.replace('+', ''),
          `🏍️ *PEDIDO ACEPTADO*\n\n` +
          `👤 Cliente: *${pedido.nombre_cliente}*\n` +
          `📞 ${pedido.telefono_cliente || 'Sin teléfono'}\n` +
          `💵 Cobrar: $${pedido.monto_cobrar} (vuelto: $${pedido.vuelto})\n` +
          `💰 Tu ganancia: *$${ganancia}*\n` +
          `📍 ${pedido.direccion_texto || 'Ver ubicación en app'}` +
          mapsLink + `\n\n` +
          `🔗 App: ${process.env.PUBLIC_URL || ''}/\nID: ${pedido_id}`
        );
      }

      // WhatsApp al comercio confirmando el operador asignado
      if (comercio) {
        await enviarWA(comercio.telefono.replace('+', ''),
          `✅ Pedido de *${pedido.nombre_cliente}* asignado a *${operador?.nombre || 'operador'}*.\n` +
          `🏍️ Estará en camino en aproximadamente ${pedido.minutos_preparacion} minutos.`
        );
      }

      console.log(`✅ Pedido ${pedido_id} aceptado por ${operador?.nombre}`);
    } catch (err) {
      console.error('❌ Error aceptando pedido:', err.message);
    }
  });

  socket.on('disconnect', () => {
    if (socket.operador_id) operadoresConectados.delete(socket.operador_id);
  });
});

async function enviarWA(telefono, mensaje) {
  try {
    await axios.post(
      `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
      { number: telefono, text: mensaje },
      { headers: { apikey: process.env.EVOLUTION_API_KEY, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('❌ WhatsApp:', e.message);
  }
}

module.exports = { db, io };

server.listen(PORT, () => {
  console.log(`🚀 RapidFly Backend corriendo en puerto ${PORT}`);
  console.log(`📡 WebSocket listo`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});
