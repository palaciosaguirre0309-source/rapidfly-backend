# RapiFly — App Android Nativa

## ¿Qué hace esta app?

Es la versión nativa de la app de operadores. A diferencia del PWA, esta:
- ✅ Mantiene el GPS activo aunque el teléfono esté bloqueado o la app minimizada
- ✅ Sigue enviando la posición al mapa del administrador en segundo plano
- ✅ Notificaciones más confiables

La app carga la misma web del servidor (`rapidfly.mundoia.digital`), pero
con capacidades nativas extra. Cuando actualizas el backend, la app se
actualiza automáticamente sin necesidad de reinstalarla.

---

## Requisitos en tu PC Windows

Solo necesitas instalar **Node.js**:
- Descárgalo de: https://nodejs.org (versión LTS, 18 o superior)
- Verifica la instalación: `node --version` en CMD

No necesitas Android Studio. La compilación ocurre en GitHub Actions.

---

## Pasos para generar el proyecto Android (una sola vez)

Abre CMD o PowerShell en tu PC Windows y ejecuta:

```cmd
cd rapidfly-backend\app-operador
npm install
npx cap add android
```

Esto genera la carpeta `android\` con el proyecto nativo.

Luego haz commit y push:
```cmd
git add android/
git commit -m "chore: agregar proyecto android capacitor"
git push origin main
```

---

## Compilar el APK (GitHub Actions — sin instalar nada extra)

1. Ve a tu repositorio en GitHub
2. Click en la pestaña **Actions**
3. En el menú izquierdo selecciona **"Build Android APK"**
4. Click en **"Run workflow"** → **"Run workflow"** (botón verde)
5. Espera ~5-8 minutos
6. Al terminar, click en el workflow completado → sección **Artifacts**
7. Descarga `rapidfly-operador-vX.zip` → dentro está el **APK**

---

## Instalar el APK en los teléfonos de los operadores

### En el teléfono Android:
1. Ir a **Ajustes → Seguridad → Instalar apps de fuentes desconocidas** → Activar
   (En algunos teléfonos: Ajustes → Aplicaciones → Menú ⋮ → Acceso especial → Instalar apps desconocidas)
2. Transferir el APK al teléfono (WhatsApp, Google Drive, o cable USB)
3. Abrir el APK en el teléfono → Instalar
4. Al abrir la app: aceptar permisos de GPS (**"Siempre"** cuando pregunte)

### Alternativa más fácil — Compartir vía link:
Sube el APK a Google Drive y comparte el enlace con los operadores.
Ellos abren el link desde el teléfono → descargan → instalan.

---

## Actualizar la app

Para la mayoría de cambios (botones, lógica, diseño): **no se necesita reinstalar**.
La app descarga automáticamente los cambios del servidor.

Solo se necesita reinstalar si:
- Se agregan nuevos plugins nativos
- Cambia la versión de Capacitor

---

## Permisos que solicita la app

| Permiso | Para qué |
|---------|----------|
| Ubicación — Siempre | GPS en segundo plano para el mapa del admin |
| Internet | Comunicación con el servidor |
| Notificaciones | Alertas de nuevos pedidos |

---

## iOS (iPhone)

Para compilar la app en iOS se requiere obligatoriamente una Mac con Xcode.
Como alternativa, el iPhone puede usar el **PWA** instalado en home screen
(Safari → Compartir → Añadir a pantalla de inicio), que funciona bien
para la mayoría de funciones excepto GPS en segundo plano.
