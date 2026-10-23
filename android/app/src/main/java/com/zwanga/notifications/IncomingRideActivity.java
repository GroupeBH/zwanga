package com.zwanga.notifications;

import android.app.Activity;
import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.StatusBarNotification;
import android.view.Gravity;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;

/** Optional, private lock-screen surface. No RN tree, location/name disclosure,
 * network mutation, microphone, wake lock, or keyguard bypass. Native Notifee
 * actions retain the existing authenticated response pipeline after unlock. */
public final class IncomingRideActivity extends Activity {
  private final Handler handler = new Handler(Looper.getMainLooper());
  private String notificationId;
  private long closesAt;
  private final Runnable refresh = new Runnable() {
    @Override public void run() {
      if (System.currentTimeMillis() >= closesAt || currentNotification() == null) { finish(); return; }
      handler.postDelayed(this, 1000);
    }
  };

  @Override protected void onCreate(Bundle state) {
    super.onCreate(state);
    if (!DriverAlertModule.fullScreenBuildEnabled(this)) { finish(); return; }
    Bundle notification = getIntent().getBundleExtra("notification");
    if (notification == null) { finish(); return; }
    notificationId = notification.getString("id");
    if (notificationId == null || currentNotification() == null) { finish(); return; }
    // Presentation ends even if JS cannot run. It never extends the server offer.
    closesAt = System.currentTimeMillis() + 30_000;
    Bundle data = notification.getBundle("data");
    if (data == null) { finish(); return; }
    String driverId = data.getString("driverId");
    if (driverId == null || !getSharedPreferences("ride-full-screen", MODE_PRIVATE).getBoolean(driverId, false)) { finish(); return; }
    try {
      java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", java.util.Locale.US);
      format.setTimeZone(java.util.TimeZone.getTimeZone("UTC")); format.setLenient(false);
      String until = data.getString("ringUntil");
      if (until == null) { finish(); return; }
      closesAt = Math.min(closesAt, format.parse(until).getTime());
      if (closesAt <= System.currentTimeMillis()) { finish(); return; }
    } catch (Exception ignored) { finish(); return; }
    if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
    else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
    LinearLayout layout = new LinearLayout(this);
    layout.setOrientation(LinearLayout.VERTICAL); layout.setGravity(Gravity.CENTER);
    int padding = (int) (24 * getResources().getDisplayMetrics().density);
    layout.setPadding(padding, padding, padding, padding); layout.setBackgroundColor(0xfffffaf6);
    TextView title = new TextView(this); title.setText("ZWANGA\nNouvelle demande de trajet");
    title.setTextSize(26); title.setTextColor(0xff1e2a4a); title.setGravity(Gravity.CENTER); layout.addView(title);
    TextView hint = new TextView(this); hint.setText("Déverrouillez pour voir les détails et répondre.");
    hint.setTextSize(17); hint.setGravity(Gravity.CENTER); hint.setPadding(0, padding, 0, padding); layout.addView(hint);
    Notification card = currentNotification();
    if (card != null && card.actions != null) for (Notification.Action action : card.actions) {
      Button button = new Button(this); button.setText(action.title); button.setAllCaps(false);
      button.setMinHeight((int) (56 * getResources().getDisplayMetrics().density));
      button.setOnClickListener(v -> unlockAndSend(action.actionIntent)); layout.addView(button);
    }
    Button details = new Button(this); details.setText("Voir la demande"); details.setAllCaps(false);
    details.setOnClickListener(v -> { Notification live = currentNotification(); if (live != null) unlockAndSend(live.contentIntent); });
    layout.addView(details); setContentView(layout); handler.postDelayed(refresh, 1000);
  }

  private Notification currentNotification() {
    try {
      NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
      if (manager == null || notificationId == null) return null;
      // Notifee uses the Java string hash for the Android notification identifier.
      for (StatusBarNotification item : manager.getActiveNotifications())
        if (item.getId() == notificationId.hashCode()) return item.getNotification();
    } catch (Exception ignored) { }
    return null;
  }
  private void unlockAndSend(PendingIntent action) {
    if (action == null || currentNotification() == null) { finish(); return; }
    Runnable send = () -> {
      if (currentNotification() == null || System.currentTimeMillis() >= closesAt) { finish(); return; }
      try { action.send(); } catch (PendingIntent.CanceledException ignored) { }
      finish();
    };
    KeyguardManager keyguard = (KeyguardManager) getSystemService(KEYGUARD_SERVICE);
    if (keyguard != null && keyguard.isKeyguardLocked()) {
      if (Build.VERSION.SDK_INT >= 26) keyguard.requestDismissKeyguard(this, new KeyguardManager.KeyguardDismissCallback() {
        @Override public void onDismissSucceeded() { send.run(); }
      });
    } else send.run();
  }
  @Override protected void onDestroy() { handler.removeCallbacksAndMessages(null); super.onDestroy(); }
}
