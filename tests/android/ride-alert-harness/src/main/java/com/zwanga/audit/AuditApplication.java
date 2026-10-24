package com.zwanga.audit;
import android.app.Application;
import app.notifee.core.Notifee;
import app.notifee.core.event.*;
import app.notifee.core.interfaces.EventListener;
public final class AuditApplication extends Application {
    public static AuditRuntime runtime;
    @Override public void onCreate() {
        super.onCreate(); runtime = new AuditRuntime(this);
        registerActivityLifecycleCallbacks(new ActivityLifecycleCallbacks() {
            @Override public void onActivityCreated(android.app.Activity activity, android.os.Bundle state) {
                if (!activity.getClass().getSimpleName().equals("IncomingRideActivity")) return;
                android.os.Bundle extras = activity.getIntent().getExtras();
                AuditRuntime.log("INCOMING created finishing=" + activity.isFinishing()
                    + " extras=" + (extras == null ? "none" : extras.keySet()));
                if (extras != null) for (String key : extras.keySet()) {
                    Object value = extras.get(key);
                    AuditRuntime.log("INCOMING extra=" + key + " type=" + (value == null ? "null" : value.getClass().getSimpleName())
                        + (value instanceof android.os.Bundle ? " keys=" + ((android.os.Bundle) value).keySet() : ""));
                }
                runtime.snapshot();
            }
            @Override public void onActivityStarted(android.app.Activity activity) { }
            @Override public void onActivityResumed(android.app.Activity activity) { }
            @Override public void onActivityPaused(android.app.Activity activity) { }
            @Override public void onActivityStopped(android.app.Activity activity) { }
            @Override public void onActivitySaveInstanceState(android.app.Activity activity, android.os.Bundle state) { }
            @Override public void onActivityDestroyed(android.app.Activity activity) { }
        });
        Notifee.initialize(new EventListener() {
            @Override public void onNotificationEvent(NotificationEvent event) {
                AuditRuntime.log("EVENT type=" + event.getType());
                if (event.getType() == NotificationEvent.TYPE_PRESS || event.getType() == NotificationEvent.TYPE_ACTION_PRESS)
                    runtime.main.post(() -> runtime.pending = event.getNotification().toBundle());
            }
            @Override public void onLogEvent(LogEvent event) { }
            @Override public void onBlockStateEvent(BlockStateEvent event) { AuditRuntime.log("BLOCK_STATE_CHANGED"); }
            @Override public void onForegroundServiceEvent(ForegroundServiceEvent event) { }
        });
    }
}
