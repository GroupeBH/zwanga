package com.zwanga.audit;
import android.app.*;
import android.content.*;
import android.os.*;
import android.util.Log;
import app.notifee.core.Notifee;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.common.LifecycleState;
import com.zwanga.notifications.DriverAlertModule;
import java.util.*;

/** Test adapter only: no React renderer, FCM, auth, router, backend or decisions. */
public final class AuditRuntime {
    static final String USER = "00000000-0000-4000-8000-000000000001";
    final Handler main = new Handler(Looper.getMainLooper());
    final ReactApplicationContext context;
    final DriverAlertModule bridge;
    Bundle pending;
    String soundOwner;
    private int sequence;
    private final Runnable heartbeat = new Runnable() {
        @Override public void run() {
            if (soundOwner == null || context.getLifecycleState() != LifecycleState.RESUMED) return;
            bridge.getForegroundSoundState(soundOwner, value -> log("PLAYER " + value));
            main.postDelayed(this, 5000);
        }
    };
    AuditRuntime(Context context) { this.context = new ReactApplicationContext(context); bridge = new DriverAlertModule(this.context); }
    static void log(String message) { Log.i("ZwangaAudit", message); }
    public void nativeCard(Runnable done) {
        bridge.ensureBundledChannel(channel -> {
            Bundle card = com.zwanga.notifications.NativeCardProbe.create(context, (String)channel);
            card.getBundle("android").putString("smallIcon", "ic_stat_zwanga_audit");
            Notifee.getInstance().displayNotification(card, (error, unused) -> {
                if (error != null) log("NATIVE_CARD_PROBE_FAILED " + error.getClass().getSimpleName());
                else {
                    for (var n : context.getSystemService(NotificationManager.class).getActiveNotifications()) {
                        if (n.getId() == card.getString("id").hashCode()) {
                            log("NATIVE_CARD_PROBE_OK actions=" + n.getNotification().actions.length + " channel=" + n.getNotification().getChannelId());
                        }
                    }
                }
                done.run();
            });
        });
    }
    static String iso(long time) {
        var format = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
        format.setTimeZone(TimeZone.getTimeZone("UTC")); return format.format(new Date(time));
    }
    public void deliver(boolean booking, boolean expired, Runnable done) {
        bridge.ensureBundledChannel(channel -> {
            bridge.canLightUpAlertScreen((String) channel, wake -> {
                bridge.canPresentFullScreen(USER, full -> {
                    String id = "audit-" + (booking ? "booking-" : "nearby-") + ++sequence;
                    Bundle data = new Bundle(); data.putString("driverId", USER);
                    data.putString("type", booking ? "new_booking" : "trip_request_nearby");
                    data.putString("ringUntil", iso(System.currentTimeMillis() + (expired ? -1000 : 30000)));
                    Bundle card = new Bundle(); card.putString("id", id); card.putBundle("data", data);
                    card.putString("title", booking ? "Zwanga · Nouvelle réservation [TEST]" : "Zwanga · Demande près de vous [TEST]");
                    card.putString("body", "Départ TEST → Destination TEST · 2 500 FC · 1 place. Ouvrez Zwanga pour répondre.");
                    boolean active = context.getLifecycleState() == LifecycleState.RESUMED;
                    Bundle android = android(active ? quietChannel() : (String) channel);
                    android.putBoolean("lightUpScreen", !active && !expired && Boolean.TRUE.equals(wake));
                    if (!active && !expired) android.putString("sound", "driver_ring");
                    if (!active && !expired && Boolean.TRUE.equals(wake) && Boolean.TRUE.equals(full)) {
                        Bundle screen = new Bundle(); screen.putString("id", "ride-full-screen");
                        screen.putString("mainComponent", "main");
                        screen.putString("launchActivity", "com.zwanga.notifications.IncomingRideActivity"); android.putBundle("fullScreenAction", screen);
                    }
                    card.putBundle("android", android);
                    if (expired) android.putString("channelId", quietChannel());
                    log("DELIVER kind=" + (booking ? "booking" : "nearby") + " active=" + active + " wake=" + android.getBoolean("lightUpScreen") + " fullscreen=" + android.containsKey("fullScreenAction"));
                    pending = card;
                    Notifee.getInstance().displayNotification(card, (error, unused) -> main.post(() -> {
                        log("DISPLAY " + (error == null ? "ok" : error.getClass().getSimpleName()));
                        if (active && !expired && context.getLifecycleState() == LifecycleState.RESUMED) start(card.getString("id"));
                        done.run();
                    }));
                });
            });
        });
    }
    private Bundle android(String channel) {
        Bundle android = new Bundle(); android.putString("channelId", channel); android.putInt("importance", 4);
        android.putString("smallIcon", "ic_stat_zwanga_audit");
        android.putInt("visibility", 0); android.putBoolean("autoCancel", false); android.putBoolean("onlyAlertOnce", true);
        android.putBoolean("loopSound", false); android.putBundle("pressAction", press("default"));
        ArrayList<Bundle> actions = new ArrayList<>();
        for (String action : new String[]{"Refuser", "Accepter"}) {
            Bundle item = new Bundle(); item.putString("title", action); item.putBundle("pressAction", press(action)); actions.add(item);
        }
        android.putParcelableArrayList("actions", actions); return android;
    }
    private Bundle press(String id) { Bundle press = new Bundle(); press.putString("id", id); press.putString("launchActivity", "com.zwanga.audit.AuditActivity"); return press; }
    String quietChannel() {
        NotificationChannel channel = new NotificationChannel("audit-quiet", "Alertes dans le test", 4);
        channel.setSound(null, null); channel.enableVibration(false);
        context.getSystemService(NotificationManager.class).createNotificationChannel(channel); return channel.getId();
    }
    void start(String id) {
        soundOwner = id;
        bridge.startForegroundSound(id, "zwanga-ride-ring-v4", false, value -> {
            log("PLAYER_STARTED " + value); main.removeCallbacks(heartbeat); main.post(heartbeat);
        });
    }
    void resume(Activity activity) {
        context.resume(activity);
        main.postDelayed(() -> {
            if (pending == null || context.activity != activity) return;
            Bundle card = pending; String id = card.getString("id");
            // Explicit local adapter for the JS handoff tested independently by Node.
            context.getSystemService(NotificationManager.class).cancel(id.hashCode());
            card.putBundle("android", android(quietChannel()));
            Notifee.getInstance().displayNotification(card, (e, unused) -> log("QUIET_CARD " + (e == null ? "ok" : "failed")));
            try {
                var format = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US); format.setTimeZone(TimeZone.getTimeZone("UTC"));
                if (format.parse(card.getBundle("data").getString("ringUntil")).getTime() > System.currentTimeMillis()) start(id);
            } catch (Exception ignored) { log("OLD_ALERT_SILENT"); }
        }, 400);
    }
    void pause() { context.pause(); main.removeCallbacks(heartbeat); }
    void clear() {
        if (soundOwner != null) bridge.stopForegroundSound(soundOwner);
        soundOwner = null; pending = null; main.removeCallbacks(heartbeat);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        for (var item : manager.getActiveNotifications()) {
            Bundle card = item.getNotification().extras.getBundle("notifee.notification");
            if (card != null) bridge.stopBackgroundAlertSound(card.getString("id"), ignored -> manager.cancel(item.getId()));
        }
        manager.cancelAll(); log("LOCAL_DECISION_CLEARED");
    }
    void snapshot() {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        log("SNAPSHOT interactive=" + context.getSystemService(PowerManager.class).isInteractive()
            + " locked=" + context.getSystemService(KeyguardManager.class).isKeyguardLocked()
            + " cards=" + manager.getActiveNotifications().length + " notifications=" + manager.areNotificationsEnabled());
        bridge.getFullScreenStatus(USER, value -> log("FSI " + value));
        bridge.getForegroundSoundState(soundOwner == null ? "none" : soundOwner, value -> log("PLAYER " + value));
    }
}
