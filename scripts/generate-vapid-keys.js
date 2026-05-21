const webpush = require('web-push');
const keys = webpush.generateVAPIDKeys();
console.log('\nCopia estos valores en Easypanel → Variables de entorno:\n');
console.log('VAPID_PUBLIC_KEY=' + keys.publicKey);
console.log('VAPID_PRIVATE_KEY=' + keys.privateKey);
console.log('\n⚠️  Guárdalos: si los regeneras, todas las suscripciones existentes dejan de funcionar.\n');
