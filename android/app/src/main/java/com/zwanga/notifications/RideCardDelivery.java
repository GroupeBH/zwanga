package com.zwanga.notifications;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Bundle;
import android.os.PowerManager;
import app.notifee.core.Notifee;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** One publication owner shared by FCM and the durable local retry worker. */
public final class RideCardDelivery {
  private static final Set<String> inFlight = ConcurrentHashMap.newKeySet();
  interface Completion { void done(Exception error); }
  interface Presenter { void show(Bundle card, Completion completion) throws Exception; }
  public static boolean deliver(Context c, Map<String,String> data) {
    return deliver(c, data, (card, done) -> Notifee.getInstance().displayNotification(card,
      (error, unused) -> done.done(error == null ? null : new Exception("NOTIFEE_DISPLAY_FAILED"))));
  }
  static boolean deliver(Context c, Map<String,String> data, Presenter presenter) {
    String user = data.get("driverId"), receipt = data.get("notificationId");
    if (!NativeRideDelivery.owns(c, user) || !RideNotificationBundle.valid(data, System.currentTimeMillis())) return true;
    if (NativeRideDelivery.receipts(c).optJSONObject(receipt) != null &&
        NativeRideDelivery.receipts(c).optJSONObject(receipt).optBoolean("displayed")) return true;
    if (!inFlight.add(receipt)) return false;
    try {
      String channel = NativeRideDelivery.prefs(c).getString("channel", "");
      NotificationManager manager = (NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
      if (!RideNotificationBundle.channel(channel) || manager == null || !manager.areNotificationsEnabled()) return true;
      if (android.os.Build.VERSION.SDK_INT >= 26) {
        android.app.NotificationChannel settings = manager.getNotificationChannel(channel);
        if (settings == null) return false;
        if (settings.getImportance() == 0) return true;
        if (android.os.Build.VERSION.SDK_INT >= 28 && settings.getGroup() != null &&
            manager.getNotificationChannelGroup(settings.getGroup()) != null && manager.getNotificationChannelGroup(settings.getGroup()).isBlocked()) return true;
      }
      boolean wake = DriverAlertModule.allowsAlertScreenWake(c, channel) && !NativeRideDelivery.foreground();
      Bundle card = RideNotificationBundle.create(c, data, channel, wake);
      NativeRideDelivery.receipt(c, user, receipt, false, card.getString("id"));
      CountDownLatch finished = new CountDownLatch(1);
      java.util.concurrent.atomic.AtomicBoolean failed = new java.util.concurrent.atomic.AtomicBoolean(false);
      try {
        presenter.show(card, error -> {
          try {
            synchronized (NativeRideDelivery.LOCK) {
              if (!NativeRideDelivery.owns(c, user) || !RideNotificationBundle.valid(data, System.currentTimeMillis())) { manager.cancel(card.getString("id").hashCode()); return; }
              if (error != null) { failed.set(true); NativeRideDelivery.failure(c, user, receipt, "NATIVE_CARD_FAILED"); }
              else if (posted(manager, card)) NativeRideDelivery.receipt(c, user, receipt, true);
            }
          } catch (Exception ignored) { failed.set(true); }
          finally { finished.countDown(); }
        });
        if (!finished.await(2, TimeUnit.SECONDS)) {
          NativeRideDelivery.failure(c, user, receipt, "NATIVE_CARD_PENDING");
          // Never race a second audible publisher against an unfinished post:
          // its late update could stop the first sound (onlyAlertOnce). The
          // persisted worker retries; a terminal failure uses the fallback.
          return false;
        }
      } catch (InterruptedException e) { Thread.currentThread().interrupt(); return false; }
      catch (Exception e) { failed.set(true); NativeRideDelivery.failure(c, user, receipt, "NATIVE_CARD_FAILED"); }
      synchronized (NativeRideDelivery.LOCK) {
        if (!NativeRideDelivery.owns(c, user)) return true;
        if (!failed.get() && !awaitPosted(manager, card)) return false;
        if (!posted(manager, card)) {
          try { RideCardFallback.display(c, card); }
          catch (Exception e) { NativeRideDelivery.failure(c, user, receipt, "NATIVE_FALLBACK_FAILED"); }
        }
        // notify() returns before the system server necessarily exposes the
        // active card. A short bounded observation avoids false delivery loss.
        if (!awaitPosted(manager, card)) return false;
        if (card.getBundle("android").containsKey("fullScreenAction")) RidePresentationExpiry.schedulePublished(c, card.getString("id"));
        NativeRideDelivery.receipt(c, user, receipt, true);
        RideAlertAudioService.startPublished(c, card.getString("id"));
        if (wake) {
          if (card.getBundle("android").containsKey("fullScreenAction")) {
            // Let SystemUI choose full-screen while the display is still off.
            // An immediate wake can turn this into a heads-up notification.
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
              try { if (NativeRideDelivery.owns(c, user) && posted(manager, card)) wake(c, channel, data.get("ringUntil")); }
              catch (Exception ignored) { }
            }, 1500);
          } else wake(c, channel, data.get("ringUntil"));
        }
        return true;
      }
    } catch (Exception error) {
      NativeRideDelivery.failure(c, user, receipt, "NATIVE_CARD_FAILED"); return false;
    } finally { inFlight.remove(receipt); }
  }
  private static boolean awaitPosted(NotificationManager manager, Bundle card) {
    for (int n=0;n<15;n++) {
      if (posted(manager, card)) return true;
      try { Thread.sleep(20); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return false; }
    }
    return posted(manager, card);
  }
  private static boolean posted(NotificationManager manager, Bundle card) {
    for (android.service.notification.StatusBarNotification item : manager.getActiveNotifications())
      if (item.getId() == card.getString("id").hashCode() && item.getTag() == null) return true;
    return false;
  }
  @SuppressWarnings("deprecation")
  private static void wake(Context c, String channel, String until) {
    try {
      PowerManager power = (PowerManager)c.getSystemService(Context.POWER_SERVICE);
      if (power == null || power.isInteractive() || NativeRideDelivery.foreground() ||
          RideNotificationBundle.date(until) <= System.currentTimeMillis() || !DriverAlertModule.allowsAlertScreenWake(c, channel)) return;
      PowerManager.WakeLock lock = power.newWakeLock(PowerManager.SCREEN_DIM_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP |
          PowerManager.ON_AFTER_RELEASE, "Zwanga:native-ride-alert"); lock.setReferenceCounted(false); lock.acquire(1500);
    } catch (Exception ignored) { }
  }
}
