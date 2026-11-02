package com.zwanga.notifications;

import android.app.KeyguardManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.BroadcastReceiver;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.os.SystemClock;

/** Restore an existing alert once per unlock, not by periodically reposting it.
 * Android can unpin heads-up on sleep even though the audio service keeps playing.
 * No overlay permission, screen wake, new sound, new card or renewed deadline. */
final class RideUnlockBanner {
  private boolean awaitingUnlock;
  private long unlockedSince = -1;
  private final Context context;
  private boolean registered;
  private final BroadcastReceiver screen = new BroadcastReceiver() {
    @Override public void onReceive(Context c, Intent intent) {
      if (Intent.ACTION_SCREEN_OFF.equals(intent.getAction())) { awaitingUnlock = true; unlockedSince = -1; }
    }
  };
  RideUnlockBanner(Context c) {
    context = c; awaitingUnlock = !unlocked(c);
    // A full-screen alert may wake the screen before the next service tick.
    // Observe this protected system event so that brief sleep is not missed.
    if (Build.VERSION.SDK_INT >= 33) try {
      c.registerReceiver(screen, new IntentFilter(Intent.ACTION_SCREEN_OFF), Context.RECEIVER_NOT_EXPORTED);
      registered = true;
    } catch (Exception ignored) { /* Polling remains a bounded fallback. */ }
  }

  void close() {
    if (registered) { registered = false; try { context.unregisterReceiver(screen); } catch (Exception ignored) { } }
  }

  void check(Context c, String id, String user, String identity) {
    if (!unlocked(c)) { awaitingUnlock = true; unlockedSince = -1; return; }
    if (!awaitingUnlock) return;
    long now = SystemClock.elapsedRealtime();
    if (unlockedSince < 0) { unlockedSince = now; return; }
    // Let SystemUI finish unlocking and its recent-full-screen cooldown.
    // A single visual update, not a retry loop fighting a dismissed banner.
    if (now - unlockedSince < 2500) return;
    awaitingUnlock = false;
    restore(c, id, user, identity);
  }

  private static boolean unlocked(Context c) {
    try {
      PowerManager power = (PowerManager)c.getSystemService(Context.POWER_SERVICE);
      KeyguardManager keyguard = (KeyguardManager)c.getSystemService(Context.KEYGUARD_SERVICE);
      return power != null && power.isInteractive() && keyguard != null && !keyguard.isKeyguardLocked();
    } catch (Exception ignored) { return false; }
  }

  private static void restore(Context c, String id, String user, String identity) {
    synchronized (NativeRideDelivery.LOCK) {
      try {
        // Android 13+ guarantees heads-up, not launching an Activity over another app.
        if (Build.VERSION.SDK_INT < 33 || id == null || identity == null ||
            NativeRideDelivery.foreground() || !NativeRideDelivery.owns(c, user) || !unlocked(c) ||
            !DriverAlertModule.fullScreenBuildEnabled(c) ||
            !c.getSharedPreferences("ride-full-screen", 0).getBoolean(user, false) ||
            c.checkSelfPermission("android.permission.USE_FULL_SCREEN_INTENT") != PackageManager.PERMISSION_GRANTED) return;
        NotificationManager manager = (NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null || !manager.areNotificationsEnabled() ||
            (Build.VERSION.SDK_INT >= 34 && !manager.canUseFullScreenIntent())) return;
        Notification live = RidePresentationExpiry.find(c, id);
        Bundle data = RideAlertAudioService.data(live);
        long now = System.currentTimeMillis();
        long deadline = data == null ? 0 : RideAlertAudioService.deadline(data, now);
        if (data == null || live.fullScreenIntent == null ||
            !user.equals(data.getString("driverId")) || !identity.equals(RideAlertAudioService.identity(data)) ||
            deadline <= now ||
            !RideAlertAudioService.CHANNEL.equals(live.getChannelId()) ||
            !RideAlertAudioService.allowed(c, RideAlertAudioService.originalChannel(live))) return;
        // This service-owned channel is silent. Re-alert the visual surface only.
        // Preserve all actions and the original identity, timeout and audio lease.
        // timeoutAfter is relative to notify(), not the original publication.
        // Reuse only the remaining lease for cards that already expire automatically.
        Notification visible = live.getTimeoutAfter() > 0 ? Notification.Builder.recoverBuilder(c, live)
          .setTimeoutAfter(Math.max(1, deadline - now)).build() : live.clone();
        visible.flags &= ~Notification.FLAG_ONLY_ALERT_ONCE;
        visible.extras = new Bundle(live.extras);
        Bundle payload = new Bundle(live.extras.getBundle("notifee.notification"));
        Bundle options = new Bundle(payload.getBundle("android"));
        options.putBoolean("onlyAlertOnce", false);
        payload.putBundle("android", options); visible.extras.putBundle("notifee.notification", payload);
        manager.notify(id.hashCode(), visible);
      } catch (Exception ignored) { /* Keep the existing card/audio if SystemUI refuses. */ }
    }
  }
}
