package digital.mundoia.rapidfly.operador;

import android.content.Context;
import android.content.Intent;
import android.os.Build;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin Capacitor que expone métodos nativos Android al JavaScript de la app.
 *
 * pedidoEntrante() — inicia PedidoService: vibración + WakeLock + FullScreenIntent
 * detenerAlertas() — detiene PedidoService: para vibración y quita la notificación
 */
@CapacitorPlugin(name = "RapiNotification")
public class RapiNotification extends Plugin {

    /**
     * Llamado desde JS cuando se detecta un pedido en background.
     * Inicia el PedidoService que maneja todo el flujo de alerta nativa.
     */
    @PluginMethod
    public void pedidoEntrante(PluginCall call) {
        String titulo     = call.getString("titulo",     "🏍️ ¡Nuevo pedido RapiFly!");
        String cuerpo     = call.getString("cuerpo",     "Hay un pedido esperando asignación");
        String pedidoJson = call.getString("pedido_json", "{}");

        Context ctx = getContext();
        Intent intent = new Intent(ctx, PedidoService.class);
        intent.putExtra(PedidoService.EXTRA_TITULO,  titulo);
        intent.putExtra(PedidoService.EXTRA_CUERPO,  cuerpo);
        intent.putExtra(PedidoService.EXTRA_PEDIDO,  pedidoJson);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent);
            } else {
                ctx.startService(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("No se pudo iniciar el servicio: " + e.getMessage());
        }
    }

    /**
     * Llamado desde JS cuando el operador acepta, rechaza o se cierra la alerta.
     * Detiene el servicio → cancela vibración → quita la notificación.
     */
    @PluginMethod
    public void detenerAlertas(PluginCall call) {
        try {
            getContext().stopService(new Intent(getContext(), PedidoService.class));
        } catch (Exception ignored) {}
        call.resolve();
    }
}
