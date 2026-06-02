package digital.mundoia.rapidfly.operador;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import androidx.core.app.NotificationCompat;

/**
 * Servicio en primer plano que maneja la alerta de nuevo pedido.
 * - Mantiene el CPU activo (WakeLock PARTIAL)
 * - Vibra con patrón continuo
 * - Muestra notificación con FullScreenIntent (como llamada entrante)
 * - Usa canal de máxima prioridad con sonido de alarma del sistema
 *
 * Se detiene cuando el operador acepta/rechaza el pedido o cierra la alerta.
 */
public class PedidoService extends Service {

    static final String CHANNEL_ID    = "rapidfly_pedidos_v2";
    static final String EXTRA_TITULO  = "titulo";
    static final String EXTRA_CUERPO  = "cuerpo";
    static final String EXTRA_PEDIDO  = "pedido_json";
    static final int    NOTIF_ID      = 1001;

    // Patrón de vibración: [espera, vibra, pausa, vibra, pausa, vibra largo] — se repite
    private static final long[] PATRON_VIBRACION = {0, 600, 200, 600, 200, 1000, 400};

    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String titulo    = intent != null ? intent.getStringExtra(EXTRA_TITULO)  : "🏍️ ¡Nuevo pedido!";
        String cuerpo    = intent != null ? intent.getStringExtra(EXTRA_CUERPO)  : "Hay un pedido esperando";
        String pedidoJson = intent != null ? intent.getStringExtra(EXTRA_PEDIDO) : "{}";

        // 1. WakeLock — mantiene el CPU activo para que el servicio corra
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "rapidfly:pedido_entrante"
            );
            wakeLock.acquire(60_000L); // máximo 60 segundos
        }

        // 2. Vibración continua con patrón (se repite hasta que se detenga el servicio)
        vibrar();

        // 3. Canal de notificación de máxima prioridad
        crearCanal();

        // 4. Intent para cuando el operador toca la notificación
        Intent abrirIntent = new Intent(this, MainActivity.class);
        abrirIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        abrirIntent.putExtra(EXTRA_PEDIDO, pedidoJson);
        PendingIntent piAbrir = PendingIntent.getActivity(
            this, 0, abrirIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // 5. FullScreenIntent — abre la app automáticamente (pantalla bloqueada o en background)
        //    Es el mecanismo equivalente a una llamada entrante.
        Intent fullIntent = new Intent(this, MainActivity.class);
        fullIntent.setFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_SINGLE_TOP |
            Intent.FLAG_ACTIVITY_CLEAR_TOP
        );
        fullIntent.putExtra(EXTRA_PEDIDO, pedidoJson);
        PendingIntent piFullScreen = PendingIntent.getActivity(
            this, 1, fullIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        Uri sonidoAlarma = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle(titulo)
            .setContentText(cuerpo)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(cuerpo))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)      // trato de "llamada entrante"
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC) // visible en pantalla bloqueada
            .setSound(sonidoAlarma)
            .setVibrate(PATRON_VIBRACION)
            .setOngoing(true)           // no se puede descartar con swipe
            .setAutoCancel(false)
            .setContentIntent(piAbrir)
            .setFullScreenIntent(piFullScreen, true)             // ← el disparador clave
            .build();

        startForeground(NOTIF_ID, notif);
        return START_NOT_STICKY;
    }

    private void vibrar() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            // Android 12+: usar VibratorManager
            VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            if (vm != null) {
                Vibrator v = vm.getDefaultVibrator();
                v.vibrate(VibrationEffect.createWaveform(PATRON_VIBRACION, 0)); // 0 = repetir
            }
        } else {
            @SuppressWarnings("deprecation")
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createWaveform(PATRON_VIBRACION, 0));
                } else {
                    v.vibrate(PATRON_VIBRACION, 0);
                }
            }
        }
    }

    private void detenerVibracion() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) vm.getDefaultVibrator().cancel();
            } else {
                @SuppressWarnings("deprecation")
                Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) v.cancel();
            }
        } catch (Exception ignored) {}
    }

    private void crearCanal() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm == null || nm.getNotificationChannel(CHANNEL_ID) != null) return;

            NotificationChannel canal = new NotificationChannel(
                CHANNEL_ID,
                "Pedidos RapiFly",
                NotificationManager.IMPORTANCE_HIGH
            );
            canal.setDescription("Alertas de nuevos pedidos de delivery");
            canal.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            canal.enableVibration(true);
            canal.setVibrationPattern(PATRON_VIBRACION);
            canal.enableLights(true);
            canal.setLightColor(0xFFC0392B); // rojo RapiFly

            Uri sonido = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            AudioAttributes aa = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            canal.setSound(sonido, aa);

            nm.createNotificationChannel(canal);
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        detenerVibracion();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        // Quitar la notificación
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            stopForeground(true);
        }
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }
}
