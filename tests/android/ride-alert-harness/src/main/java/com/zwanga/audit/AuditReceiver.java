package com.zwanga.audit;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
public final class AuditReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        AuditRuntime runtime = AuditApplication.runtime;
        String operation = intent.getStringExtra("operation");
        if ("native-payload".equals(operation)) {
            PendingResult result = goAsync();
            runtime.bridge.ensureBundledChannel(channel -> com.zwanga.notifications.NativeCardProbe.deliver(context,
                intent.getStringExtra("payload"), intent.getBooleanExtra("failPrimary", false), intent.getStringExtra("mode") == null ? "deliver" : intent.getStringExtra("mode"), result::finish));
        } else if ("snapshot".equals(operation)) runtime.snapshot();
        else if ("clear".equals(operation)) runtime.clear();
        else if ("consent".equals(operation)) {
            context.getSharedPreferences("ride-full-screen", Context.MODE_PRIVATE).edit()
                .putBoolean(AuditRuntime.USER, intent.getBooleanExtra("enabled", false)).apply();
            runtime.snapshot();
        } else if ("native-card".equals(operation)) {
            PendingResult result = goAsync(); runtime.nativeCard(result::finish);
        } else if ("deliver".equals(operation)) {
            PendingResult result = goAsync();
            runtime.deliver("booking".equals(intent.getStringExtra("kind")), intent.getBooleanExtra("expired", false), result::finish);
        }
    }
}
