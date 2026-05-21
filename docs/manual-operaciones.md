# Manual de Operaciones — RapiFly
**Versión 1.0 · Mayo 2026**

---

## 1. ¿Qué es RapiFly?

RapiFly es un sistema de gestión de delivery en tiempo real. Automatiza el proceso completo: desde que un comercio envía un pedido por WhatsApp hasta que el operador lo entrega y el cliente recibe confirmación.

---

## 2. Roles del sistema

| Rol | Acceso | Función |
|-----|--------|---------|
| **Administrador** | Panel web `/admin` | Gestiona operadores, comercios, monitorea pedidos en tiempo real |
| **Operador (motorizado)** | App móvil `/` | Recibe y gestiona sus pedidos, ve sus ganancias |
| **Comercio** | Portal web `/comercio` | Ve el estado de sus pedidos del día en tiempo real |

---

## 3. Flujo completo de un pedido

```
Comercio → WhatsApp → Claude AI → Sistema → Operador → Cliente
```

1. El comercio envía los detalles del pedido por WhatsApp al número de RapiFly
2. La IA (Claude) extrae automáticamente: cliente, dirección, montos, teléfono
3. El pedido se crea en el sistema y el panel admin lo muestra al instante
4. Todos los operadores disponibles reciben una alerta en su app (sonido + vibración + push notification)
5. El primer operador que toca "Aceptar" se lleva el pedido; los demás ven "ya tomado"
6. El operador recibe por WhatsApp los detalles completos del pedido
7. El operador marca "En camino" → el cliente recibe WhatsApp de confirmación
8. El operador marca "Entregado" → se registra automáticamente su ganancia

---

## 4. Panel Administrador

**URL:** `https://rapidfly.mundoia.digital/admin`

**Credenciales:** configuradas en variables de entorno (`ADMIN_USER` / `ADMIN_PASSWORD`)

### 4.1 Secciones del panel

**Dashboard (página principal)**
- Resumen del día: pedidos totales, operadores activos, ingresos
- Pedidos sin operador: aparecen en amarillo cuando ningún operador aceptó
- Desde aquí puede asignarse manualmente un operador a cualquier pedido

**Pedidos activos**
- Lista en tiempo real de todos los pedidos en curso
- Estados: `pendiente → asignado → en_camino → entregado`
- Posición GPS del operador en tiempo real

**Operadores**
- Lista de operadores con estado (disponible/ocupado/desconectado)
- Agregar, editar, activar/desactivar operadores
- Ver historial de entregas y balance de cada operador

**Comercios**
- Lista de comercios registrados
- Agregar/editar comercios
- Asignar zona tarifaria predeterminada

**Reportes**
- Ganancias por semana (empresa y operadores)
- Pedidos por comercio
- Pedidos por operador

### 4.2 Gestión de pedidos sin operador

Cuando un pedido se queda sin operador (todos rechazaron o no contestaron):
1. Aparece una alerta en el dashboard con fondo amarillo
2. El admin selecciona un operador disponible del menú desplegable
3. Presiona "Asignar" → el operador recibe el pedido directamente en su app

---

## 5. App del Operador (motorizado)

**URL:** `https://rapidfly.mundoia.digital/`

### 5.1 Instalación en el teléfono

**Android:**
1. Abrir la URL en Chrome
2. Aparece un banner "Instalar en tu teléfono" → tocar "Instalar"

**iPhone:**
1. Abrir la URL en Safari (no en Chrome ni otro navegador)
2. Tocar el botón 📤 Compartir en la barra de Safari
3. Seleccionar "Añadir a pantalla de inicio"
4. Tocar "Añadir"

### 5.2 Inicio de sesión

El operador ingresa su número de WhatsApp registrado (el mismo que tiene en el sistema).
- Formato: `+584141234567` (con código de país)
- Si el número no está registrado, debe contactar al administrador

### 5.3 Pestaña "Mi Pedido"

- **Sin pedido:** pantalla de espera con puntos animados. El GPS aparece como "desactivado"
- **Cuando llega un pedido:** alerta de pantalla completa con sonido y vibración
  - Muestra: cliente, dirección, monto a cobrar, su ganancia (75%)
  - Tiene **45 segundos** para aceptar. Si no acepta, la alerta queda visible con sonido cada 10 s
  - Botones: "No puedo" (rechazar) / "✅ Aceptar pedido"
- **Pedido aceptado:**
  - Muestra datos completos: cliente, teléfono, dirección, comercio, tiempo de preparación
  - Botón "🗺️ Navegar con Google Maps" (abre navegación directa)
  - GPS se activa automáticamente y envía posición cada 15 segundos
  - Botón "🏍️ Estoy en camino" → cliente recibe WhatsApp de confirmación
  - Botón "✅ Entregado" → se libera el operador, se registra la ganancia

### 5.4 Pestaña "📋 Historial"

- Lista de todas las entregas del operador
- Filtros: 7 días / 30 días / 3 meses
- Cada entrega muestra: cliente, dirección, comercio, monto cobrado, ganancia, estado de pago

### 5.5 Pestaña "💵 Ganancias"

- Resumen del día: número de entregas y total ganado
- Resumen de la semana: total, ya cobrado, por cobrar
- Lista de los servicios recientes de la semana

---

## 6. Portal del Comercio

**URL:** `https://rapidfly.mundoia.digital/comercio`

### 6.1 Acceso

El comercio ingresa con el mismo número de WhatsApp que usa para enviar pedidos.

### 6.2 Funciones

- Ver todos sus pedidos del día con estados en tiempo real
- Estadísticas: total pedidos, pendientes, en camino, entregados
- Cuando se asigna un operador, aparece el nombre y teléfono del operador
- Actualización automática sin recargar la página (WebSocket)

---

## 7. Cómo registrar un nuevo operador

1. En el panel admin, ir a **Operadores → Agregar**
2. Ingresar: nombre completo, número de WhatsApp (con +58), vehículo
3. El operador queda como "activo" y "disponible" por defecto
4. Compartir la URL de la app con el operador: `https://rapidfly.mundoia.digital/`
5. El operador puede instalarla en su teléfono e ingresar con su número

---

## 8. Cómo registrar un nuevo comercio

1. En el panel admin, ir a **Comercios → Agregar**
2. Ingresar: nombre del comercio, número de WhatsApp, zona tarifaria predeterminada
3. El comercio ya puede enviar pedidos por WhatsApp al número de RapiFly
4. Para acceder al portal, compartir: `https://rapidfly.mundoia.digital/comercio`

---

## 9. Estructura de tarifas y ganancias

| Concepto | Porcentaje |
|----------|-----------|
| Ganancia del operador | 75% del costo de delivery |
| Ingreso de la empresa | 25% del costo de delivery |

**Ejemplo:** Delivery de $3.00
- Operador gana: $2.25
- Empresa retiene: $0.75

Las ganancias se acumulan semanalmente y el admin puede marcarlas como "pagadas" desde el panel.

---

## 10. Zonas tarifarias (configurables)

| Zona | Descripción | Tarifa por defecto |
|------|-------------|-------------------|
| Zona 1 | Cercana | $1.50 |
| Zona 2 | Media | $2.50 |
| Zona 3 | Lejana | $3.50 |
| Zona 4 | Muy lejana | $5.00 |

Las tarifas se configuran desde el panel admin → Configuración.

---

## 11. Notificaciones automáticas por WhatsApp

| Evento | Destinatario | Mensaje |
|--------|-------------|---------|
| Pedido recibido | Comercio | Confirmación de recepción y asignación en progreso |
| Operador asignado | Comercio | Nombre del operador y tiempo estimado |
| Pedido aceptado | Operador | Detalles completos + enlace Google Maps |
| Operador en camino | Cliente | Confirmación con nombre del operador y dirección |

---

## 12. Solución de problemas frecuentes

| Problema | Causa | Solución |
|---------|-------|---------|
| Operador no recibe pedidos | No está marcado como "disponible" | Verificar en panel admin → Operadores |
| Pedido se queda sin tomar | Operadores desconectados o no disponibles | Asignación manual desde el dashboard |
| La app no carga en iPhone | Está usando Chrome en iOS | Abrir en Safari y añadir a pantalla de inicio |
| El operador no puede ingresar | Número no registrado | Registrarlo en panel admin → Operadores |
| No llegan mensajes WhatsApp | Evolution API desconectada | Verificar estado de la instancia en Evolution API |
| GPS no funciona | Permisos denegados | El operador debe permitir ubicación en el navegador/app |

---

## 13. Infraestructura técnica (referencia para soporte)

- **Servidor:** VPS en Easypanel (`147.93.128.107`)
- **Proyecto:** `mundoia_paladiz` → servicio `rapidfly-backend`
- **Base de datos:** PostgreSQL (contenedor `rapidfly-db`)
- **WhatsApp:** Evolution API v2.3.7 (instancia: `rapidfly`)
- **IA:** Claude (Anthropic API) para parseo de pedidos
- **Repositorio:** GitHub (`palaciosaguirre0309-source/rapidfly-backend`)
- **Dominio:** `rapidfly.mundoia.digital`

Para desplegar una actualización:
1. El código se sube a GitHub
2. En Easypanel: entrar al proyecto → servicio → "Implementar"

---

*Manual preparado por MundoIA · palaciosaguirre0309@gmail.com*
