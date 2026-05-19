// ============================================================
// RAPIDFLY - Servidor Principal
// Node.js + Express + Socket.io
// MundoIA © 2026
// ============================================================

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const { Pool }   = require('pg');

// ============================================================
// CONFIGURACIÓN
// ============================================================

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

// Base de datos
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Verificar conexión DB
db.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error conectando a PostgreSQL:', err.message);
  } else {
    console.log('✅ PostgreSQL conectado');
    release();
  }
});

// ============================================================
// MIDDLEWARES
// ============================================================

app.use(cors());
app.use(express.json());
app.use(express.static('../pwa-operador'));

// Pasar db e io a las rutas
app.use((req, res, next) => {
  req.db = db;
  req.io = io;
  next();
});

// ============================================================
// RUTAS
// ============================================================

app.use('/api/pedidos',    require('./routes/pedidos'));
app.use('/api/operadores', require('./routes/operadores'));
app.use('/api/tracking',   require('./routes/tracking'));
app.use('/api/balance',    require('./routes/balance'));
app.use('/api/reportes',   require('./routes/reportes'));
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/webhook',    require('./routes/webhook'));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============================================================
// WEBSOCKET - GPS EN TIEMPO REAL
// ============================================================

// Mapa de operadores conectados: { operador_id: socket.id }
const operadoresConectados = new Map();

io.on('connection', (socket) => {
  console.log(`🔌 Cliente conectado: ${socket.id}`);

  // Operador se identifica al conectarse
  socket.on('operador:identificar', (data) => {
    const { operador_id } = data;
    operadoresConectados.set(operador_id, socket.id);
    socket.operador_id = operador_id;
    console.log(`🏍️  Operador ${operador_id} conectado`);
  });

  // Operador envía su posición GPS cada 5 segundos
  socket.on('operador:posicion', async (data) => {
    const { operador_id, pedido_id, lat, lng } = data;

    try {
      // Guardar en base de datos
      await db.query(
        `INSERT INTO tracking (pedido_id, operador_id, lat, lng)
         VALUES ($1, $2, $3, $4)`,
        [pedido_id, operador_id, lat, lng]
      );

      // Broadcast a la sala del pedido (cliente y admin lo ven)
      io.to(`pedido:${pedido_id}`).emit('operador:posicion', {
        operador_id, lat, lng, timestamp: new Date().toISOString()
      });

      // Broadcast al panel admin
      io.to('admin').emit('operador:posicion', {
        operador_id, pedido_id, lat, lng, timestamp: new Date().toISOString()
      });

    } catch (err) {
      console.error('❌ Error guardando tracking:', err.message);
    }
  });

  // Cliente de tracking se une a la sala del pedido
  socket.on('tracking:unirse', (data) => {
    const { pedido_id } = data;
    socket.join(`pedido:${pedido_id}`);
    console.log(`👁️  Cliente viendo pedido ${pedido_id}`);
  });

  // Admin se une a la sala general
  socket.on('admin:unirse', () => {
    socket.join('admin');
    console.log(`👨‍💼 Admin conectado`);
    // Enviar posiciones actuales de todos los operadores activos
    socket.emit('admin:operadores_activos', 
      Array.from(operadoresConectados.keys())
    );
  });

  // Cambio de estado desde la app del operador
  socket.on('pedido:estado', async (data) => {
    const { pedido_id, estado, operador_id, lat, lng } = data;

    try {
      let query = '';
      let params = [];

      if (estado === 'en_camino') {
        query = `UPDATE pedidos SET estado='en_camino', hora_tomado=NOW()
                 WHERE id=$1 RETURNING *`;
        params = [pedido_id];
      } else if (estado === 'entregado') {
        query = `UPDATE pedidos SET estado='entregado', hora_entregado=NOW()
                 WHERE id=$1 RETURNING *`;
        params = [pedido_id];
      }

      const result = await db.query(query, params);
      const pedido = result.rows[0];

      // Notificar a todos los que siguen este pedido
      io.to(`pedido:${pedido_id}`).emit('pedido:estado', {
        pedido_id, estado, timestamp: new Date().toISOString()
      });

      // Notificar al admin
      io.to('admin').emit('pedido:estado', {
        pedido_id, estado, operador_id, timestamp: new Date().toISOString()
      });

      // Si entregado: sumar al balance del operador
      if (estado === 'entregado' && pedido) {
        const semana = getSemanaActual();
        await db.query(
          `INSERT INTO balance_operadores (operador_id, pedido_id, monto, semana)
           VALUES ($1, $2, $3, $4)`,
          [operador_id, pedido_id, pedido.costo_delivery, semana]
        );

        // Liberar al operador
        await db.query(
          `UPDATE operadores SET disponible=true WHERE id=$1`,
          [operador_id]
        );

        console.log(`✅ Pedido ${pedido_id} entregado - Balance actualizado`);
      }

    } catch (err) {
      console.error('❌ Error actualizando estado:', err.message);
      socket.emit('error', { message: 'Error actualizando estado' });
    }
  });

  // Desconexión
  socket.on('disconnect', () => {
    if (socket.operador_id) {
      operadoresConectados.delete(socket.operador_id);
      console.log(`🔌 Operador ${socket.operador_id} desconectado`);
    }
  });
});

// ============================================================
// HELPERS
// ============================================================

function getSemanaActual() {
  const now   = new Date();
  const start = new Date(now.getFullYear(), 0, 1);
  const week  = Math.ceil((((now - start) / 86400000) + start.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Exportar para uso en rutas
module.exports = { db, io };

// ============================================================
// INICIAR SERVIDOR
// ============================================================

server.listen(PORT, () => {
  console.log(`🚀 RapidFly Backend corriendo en puerto ${PORT}`);
  console.log(`📡 WebSocket listo`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});
