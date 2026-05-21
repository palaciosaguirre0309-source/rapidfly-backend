const axios = require('axios');

async function enviarWA(telefono, mensaje) {
  try {
    const numero = telefono.toString().replace('+', '').replace(/\s/g, '');
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
