require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const { Pool }   = require('pg');
const path       = require('path');

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/admin', express.static(path.join(__dirname, 'admin')));
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
      io.to(`pedido:${pedido_id}`).emit('operador:posicion', { operador_id, lat, lng, timestamp: new Date().toISOString() });
      io.to('admin').emit('operador:posicion', { operador_id, pedido_id, lat, lng, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error('❌ Error guardando tracking:', err.message);
    }
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
      if (estado === 'entregado' && pedido) {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        const week = Math.ceil((((now - start) / 86400000) + start.getDay() + 1) / 7);
        const semana = `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
        const monto_op  = parseFloat((pedido.costo_delivery * 0.75).toFixed(2));
        const monto_emp = parseFloat((pedido.costo_delivery * 0.25).toFixed(2));
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

  socket.on('disconnect', () => {
    if (socket.operador_id) operadoresConectados.delete(socket.operador_id);
  });
});

module.exports = { db, io };

server.listen(PORT, () => {
  console.log(`🚀 RapidFly Backend corriendo en puerto ${PORT}`);
  console.log(`📡 WebSocket listo`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
});
