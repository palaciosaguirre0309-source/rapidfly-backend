// Módulo de cálculo de tarifas de delivery por distancia real en carretera.
// Usa OpenStreetMap Nominatim para geocodificar y OSRM para ruteo.
// No requiere API key.

const axios = require('axios');

// Tabulador de precios (km → precio en USD)
// Cada entrada es el precio para distancias <= max km
const TARIFAS = [
  { max: 2,   precio: 1.00 },
  { max: 3.5, precio: 1.50 },
  { max: 5,   precio: 2.00 },
  { max: 6,   precio: 2.50 },
  { max: 7,   precio: 3.00 },
  { max: 8,   precio: 3.50 },
  { max: 10,  precio: 4.00 },
  { max: 12,  precio: 5.00 },
  { max: 13,  precio: 6.00 },
  { max: 14,  precio: 6.50 },
  { max: 15,  precio: 7.00 },
  { max: 16,  precio: 8.00 },
  { max: 17,  precio: 8.50 },
  { max: 18,  precio: 9.00 },
  { max: 19,  precio: 10.00 },
  { max: 20,  precio: 10.50 },
  { max: 21,  precio: 11.00 },
  { max: 22,  precio: 11.50 },
  { max: 23,  precio: 12.00 },
  { max: 24,  precio: 13.00 },
  { max: 25,  precio: 14.00 },
  { max: 26,  precio: 15.00 },
  { max: 27,  precio: 16.00 },
  { max: 28,  precio: 17.00 },
  { max: 29,  precio: 18.00 },
  { max: 30,  precio: 18.50 },
  { max: 31,  precio: 19.00 },
  { max: 32,  precio: 20.00 },
  { max: 33,  precio: 21.00 },
  { max: 35,  precio: 22.00 },
  { max: 37,  precio: 22.50 },
  { max: 38,  precio: 23.00 },
  { max: 40,  precio: 24.00 },
  { max: 45,  precio: 25.00 },
  { max: 55,  precio: 28.00 },
  { max: 65,  precio: 30.00 },
];

// Retorna el precio en USD para una distancia dada, o null si excede 65 km
function tarifaPorKm(km) {
  const entrada = TARIFAS.find(t => km <= t.max);
  return entrada ? entrada.precio : null;
}

// Geocodifica una dirección de texto usando Nominatim (OSM).
// Venezuela prioritaria vía countrycodes=ve.
async function geocodificar(texto) {
  const params = new URLSearchParams({
    q:            texto + ', Venezuela',
    format:       'json',
    limit:        '1',
    countrycodes: 've',
  });
  const { data } = await axios.get(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: {
        'User-Agent': 'RapiFly-Delivery/1.0 (contact@mundoia.digital)',
        'Accept-Language': 'es',
      },
      timeout: 8000,
    }
  );
  if (!data || !data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

// Obtiene la distancia en km por carretera entre dos puntos usando OSRM.
async function calcularDistanciaEnCarretera(origen, destino) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${origen.lng},${origen.lat};${destino.lng},${destino.lat}?overview=false`;
  const { data } = await axios.get(url, { timeout: 10000 });
  if (data.code !== 'Ok' || !data.routes || !data.routes.length) return null;
  return data.routes[0].distance / 1000; // metros → km
}

// Función principal. Retorna { distancia_km, monto_delivery } o null si falla.
async function calcularTarifaDelivery(origenText, destinoText) {
  const [origenCoords, destinoCoords] = await Promise.all([
    geocodificar(origenText),
    geocodificar(destinoText),
  ]);

  if (!origenCoords) {
    console.warn(`🗺️ No se pudo geocodificar origen: "${origenText}"`);
    return null;
  }
  if (!destinoCoords) {
    console.warn(`🗺️ No se pudo geocodificar destino: "${destinoText}"`);
    return null;
  }

  const km = await calcularDistanciaEnCarretera(origenCoords, destinoCoords);
  if (km === null) {
    console.warn(`🗺️ OSRM no pudo calcular ruta entre "${origenText}" y "${destinoText}"`);
    return null;
  }

  const monto_delivery = tarifaPorKm(km);
  if (monto_delivery === null) {
    console.warn(`🗺️ Distancia ${km.toFixed(2)} km supera el tope de 65 km`);
    return null;
  }

  return {
    distancia_km:   parseFloat(km.toFixed(2)),
    monto_delivery,
  };
}

module.exports = { calcularTarifaDelivery, tarifaPorKm };
