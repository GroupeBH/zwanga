package com.zwanga.audit;
import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;
import android.widget.*;
public final class AuditActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        if (getIntent().getBooleanExtra("preview", false)) {
            AuditApplication.runtime.clear();
            com.zwanga.notifications.NativeCardProbe.preview(this, getIntent().getBooleanExtra("locked", true), getIntent().getBooleanExtra("booking", false));
            return;
        }
        LinearLayout layout = new LinearLayout(this); layout.setOrientation(LinearLayout.VERTICAL); layout.setPadding(32, 80, 32, 32);
        TextView title = new TextView(this); title.setText("ZWANGA — TEST LOCAL\nSans serveur ni vrai compte\n\nDépart TEST → Destination TEST\n2 500 FC · 1 place"); title.setTextSize(23); layout.addView(title);
        for (String label : new String[]{"Accepter (simulation)", "Refuser (simulation)", "État du lecteur"}) {
            Button button = new Button(this); button.setText(label); layout.addView(button);
            button.setOnClickListener(v -> { if (label.startsWith("État")) AuditApplication.runtime.snapshot(); else AuditApplication.runtime.clear(); });
        }
        setContentView(layout);
    }
    @Override protected void onNewIntent(Intent intent) { super.onNewIntent(intent); setIntent(intent); AuditRuntime.log("DETAIL_OPENED"); }
    @Override protected void onResume() {
        super.onResume();
        if (getIntent().getBooleanExtra("audioTest", false)) {
            // Visible Activity gives a real allowed FGS start; the simulated React host
            // stays background. This does NOT simulate the high-priority FCM exemption.
            AuditApplication.runtime.pause();
        } else if (!getIntent().getBooleanExtra("preview", false)) {
            AuditRuntime.log("ACTIVITY_RESUMED"); AuditApplication.runtime.resume(this);
        }
    }
    @Override protected void onPause() { AuditApplication.runtime.pause(); super.onPause(); }
}
