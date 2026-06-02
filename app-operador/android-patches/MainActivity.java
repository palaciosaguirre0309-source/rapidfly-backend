package digital.mundoia.rapidfly.operador;

import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

/**
 * Actividad principal de RapiFly Operador.
 *
 * Registra el plugin RapiNotification y maneja los intents que llegan
 * desde la notificación de pedido (FullScreenIntent de PedidoService).
 *
 * Cuando la actividad se abre por la notificación:
 *  1. Enciende la pantalla aunque esté bloqueada
 *  2. Detiene el PedidoService (vibración + notificación)
 *  3. Pasa el JSON del pedido al JavaScript para mostrar la alerta
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RapiNotification.class);
        super.onCreate(savedInstanceState);
        manejarIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        manejarIntent(intent);
    }

    private void manejarIntent(Intent intent) {
        if (intent == null) return;
        String pedidoJson = intent.getStringExtra(PedidoService.EXTRA_PEDIDO);
        if (pedidoJson == null || pedidoJson.isEmpty() || pedidoJson.equals("{}")) return;

        // Encender pantalla y mostrar sobre la pantalla bloqueada
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
        }
        // Fallback para Android < 8.1 (flags de ventana)
        getWindow().addFlags(
            WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
            WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON  |
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        );

        // Detener el servicio de alerta (para vibración y notificación)
        stopService(new Intent(this, PedidoService.class));

        // Pasar el pedido al JavaScript una vez que el WebView esté listo
        final String json = pedidoJson;
        getBridge().getWebView().post(() ->
            getBridge().getWebView().evaluateJavascript(
                "(function(){" +
                "  try {" +
                "    var p = " + json + ";" +
                "    if (typeof mostrarAlertaDesdeNotif === 'function') {" +
                "      mostrarAlertaDesdeNotif(p);" +
                "    } else {" +
                "      window._pedidoPendienteNotif = p;" +
                "    }" +
                "  } catch(e) { console.warn('RapiFly intent error:', e); }" +
                "})()",
                null
            )
        );
    }
}
