const axios = require('axios');

function normalizarTelefono(telefono) {
  let n = telefono.toString().replace(/[\s\-().+]/g, ''); // quitar espacios, guiones, paréntesis, +
  // Número venezolano local (04XX...) → internacional (584XX...)
  if (/^0[24]\d{9}$/.test(n)) n = '58' + n.slice(1);
  return n;
}

async function enviarWA(telefono, mensaje) {
  try {
    const numero = normalizarTelefono(telefono);
    await axios.post(
      `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
      { number: numero, text: mensaje },
      { headers: { apikey: process.env.EVOLUTION_API_KEY, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('❌ WhatsApp:', e.message);
  }
}

module.exports = { enviarWA };
