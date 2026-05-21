// Genera icon-192.png e icon-512.png para la PWA del operador
// Uso: node scripts/create-icons.js
const fs   = require('fs');
const zlib = require('zlib');
const path = require('path');

function crc32(buf) {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const tp  = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tp, data])));
  return Buffer.concat([len, tp, data, crc]);
}

// Crea un PNG cuadrado con fondo azul oscuro y círculo rojo con letras "RF"
function makePNG(size) {
  const sig  = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB truecolor

  const row  = 1 + size * 3;
  const raw  = Buffer.alloc(size * row, 0);

  const cx = size / 2, cy = size / 2;
  const r  = size * 0.42;      // radio del círculo
  const bg = [13, 19, 33];     // #0D1321
  const red = [192, 57, 43];   // #C0392B

  for (let y = 0; y < size; y++) {
    raw[y * row] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const [R, G, B] = dist <= r ? red : bg;
      raw[y * row + 1 + x * 3]     = R;
      raw[y * row + 1 + x * 3 + 1] = G;
      raw[y * row + 1 + x * 3 + 2] = B;
    }
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const dest = path.join(__dirname, '../pwa-operador');
fs.writeFileSync(path.join(dest, 'icon-192.png'), makePNG(192));
fs.writeFileSync(path.join(dest, 'icon-512.png'), makePNG(512));
console.log('✅ icon-192.png e icon-512.png creados en pwa-operador/');
