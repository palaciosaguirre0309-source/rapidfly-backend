package digital.mundoia.rapidfly.operador;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.view.WindowManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Plugin nativo Capacitor para traer la app al primer plano desde background.
 * Llamado desde JS cuando llega un pedido y la app está minimizada.
 * Enciende la pantalla aunque esté bloqueada (útil para operadores).
 */
@CapacitorPlugin(name = "RapiNotification")
public class RapiNotification extends Plugin {

    @PluginMethod
    public void traerAlFrente(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("sin_actividad");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                // Mostrar aunque la pantalla esté bloqueada
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
                    activity.setShowWhenLocked(true);
                    activity.setTurnScreenOn(true);
                } else {
                    activity.getWindow().addFlags(
                        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
                    );
                }
                // Traer la actividad al frente
                Intent intent = new Intent(activity, activity.getClass());
                intent.addFlags(
                    Intent.FLAG_ACTIVITY_REORDER_TO_FRONT |
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
                );
                activity.startActivity(intent);
                call.resolve();
            } catch (Exception e) {
                call.reject("error: " + e.getMessage());
            }
        });
    }
}
