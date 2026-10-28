package com.zwanga.notifications;

import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.service.notification.StatusBarNotification;
import androidx.work.*;
import java.util.concurrent.TimeUnit;

/** End the intrusive presentation, not the pending booking, without ringing again. */
public final class RidePresentationExpiry extends Worker {
  public RidePresentationExpiry(Context context, WorkerParameters parameters) { super(context, parameters); }

  static Notification find(Context c, String id) {
    NotificationManager manager = (NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
    if (manager != null) for (StatusBarNotification item : manager.getActiveNotifications())
      if (item.getTag() == null && item.getId() == id.hashCode()) return item.getNotification();
    return null;
  }
  private static String signature(Bundle data) {
    return data.getString("notificationId", "") + "|" + data.getString("nativeSoundUntil", data.getString("ringUntil", ""));
  }
  static boolean schedulePublished(Context c, String id) {
    try {
      if (id == null || id.length() > 200) return false;
      Notification live = find(c, id);
      Bundle card = live == null || live.extras == null ? null : live.extras.getBundle("notifee.notification");
      if (card == null) return false;
      Bundle data = card.getBundle("data");
      if (live.fullScreenIntent == null && (data == null || !data.containsKey("rideAudioChannel"))) return false;
      String user = data == null ? null : data.getString("driverId");
      if (!RideNotificationBundle.uuid(user)) return false;
      long now = System.currentTimeMillis(), deadline = now + 60000;
      long sound = RideNotificationBundle.date(data.getString("nativeSoundUntil", data.getString("ringUntil")));
      if (sound > 0) deadline = Math.min(deadline, sound);
      for (String key : new String[]{"expiresAt", "alertExpiresAt"}) {
        long until = RideNotificationBundle.date(data.getString(key));
        if (until > 0) deadline = Math.min(deadline, until);
      }
      Data input = new Data.Builder().putString("card", id).putString("user", user)
        .putString("signature", signature(data)).putLong("deadline", deadline).build();
      Context app = c.getApplicationContext();
      // One local timer while alive, a durable fallback if Android stops the process.
      // WorkManager timing is best effort under Doze; this never wakes the phone.
      new Handler(Looper.getMainLooper()).postDelayed(() -> demote(app, input), Math.max(0, deadline - now));
      OneTimeWorkRequest work = new OneTimeWorkRequest.Builder(RidePresentationExpiry.class).setInputData(input)
        .setInitialDelay(Math.max(0, deadline - now), TimeUnit.MILLISECONDS).build();
      WorkManager.getInstance(app).enqueueUniqueWork("ride-presentation-" + id, ExistingWorkPolicy.REPLACE, work);
      return true;
    } catch (Exception ignored) { return false; }
  }
  static void demote(Context c, Data input) {
    synchronized (NativeRideDelivery.LOCK) {
      try {
        String id = input.getString("card"), user = input.getString("user");
        if (id == null || user == null || System.currentTimeMillis() < input.getLong("deadline", Long.MAX_VALUE)) return;
        Notification live = find(c, id);
        if (live == null) return;
        Bundle payload = live.extras == null ? null : live.extras.getBundle("notifee.notification");
        Bundle data = payload == null ? null : payload.getBundle("data");
        // The JS fallback can publish before the native receiver's account is bound.
        // Only demote this exact existing card; never require/revive an auth session.
        if (data == null || !user.equals(data.getString("driverId")) || !signature(data).equals(input.getString("signature"))) return;
        boolean releaseAudio = input.getBoolean("releaseAudio", false) ||
          (input.getLong("deadline", 0) > 0 && data.containsKey("rideAudioChannel"));
        if (live.fullScreenIntent == null && (!releaseAudio || (live.flags & Notification.FLAG_ONGOING_EVENT) == 0)) return;
        Notification quiet = live.clone();
        quiet.fullScreenIntent = null;
        quiet.flags |= Notification.FLAG_ONLY_ALERT_ONCE;
        quiet.flags &= ~Notification.FLAG_INSISTENT;
        quiet.extras = new Bundle(live.extras);
        Bundle card = new Bundle(payload), options = new Bundle(payload.getBundle("android"));
        options.remove("fullScreenAction"); options.putBoolean("loopSound", false);
        if (releaseAudio) {
          quiet.flags &= ~Notification.FLAG_ONGOING_EVENT;
          options.putBoolean("ongoing", false);
        }
        card.putBundle("android", options); quiet.extras.putBundle("notifee.notification", card);
        ((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(id.hashCode(), quiet);
      } catch (Exception ignored) { /* Never revive a removed card or break its actions. */ }
    }
  }
  static void releaseNow(Context c, String id, String user, String identity, boolean releaseAudio) {
    if (id == null || user == null || identity == null) return;
    demote(c, new Data.Builder().putString("card", id).putString("user", user)
      .putString("signature", identity).putLong("deadline", 0).putBoolean("releaseAudio", releaseAudio).build());
  }
  @Override public Result doWork() {
    if (System.currentTimeMillis() < getInputData().getLong("deadline", 0) && getRunAttemptCount() < 2) return Result.retry();
    demote(getApplicationContext(), getInputData()); return Result.success();
  }
}
