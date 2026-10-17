package com.zwanga.notifications;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/** No player/service, volume override or work at application startup. Android owns playback. */
public final class DriverAlertModule extends ReactContextBaseJavaModule {
  static final String LEGACY_CHANNEL = "booking-ring-v2";
  static final String PHONE_CHANNEL = "driver-phone-ring-v3";

  public DriverAlertModule(ReactApplicationContext context) { super(context); }

  @Override public String getName() { return "ZwangaDriverAlerts"; }

  @ReactMethod
  public void ensureChannel(Promise promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        promise.resolve(LEGACY_CHANNEL);
        return;
      }
      Context context = getReactApplicationContext();
      NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      if (manager == null) { promise.resolve(LEGACY_CHANNEL); return; }
      // Never recreate/reset an existing channel, including one muted by the user.
      if (manager.getNotificationChannel(PHONE_CHANNEL) != null) {
        promise.resolve(PHONE_CHANNEL);
        return;
      }
      NotificationChannel legacy = manager.getNotificationChannel(LEGACY_CHANNEL);
      if (legacy != null && !canMigrate(context, manager, legacy)) {
        promise.resolve(LEGACY_CHANNEL);
        return;
      }
      NotificationChannel channel = new NotificationChannel(PHONE_CHANNEL,
          "Nouveaux clients et réservations", NotificationManager.IMPORTANCE_HIGH);
      channel.setDescription("Sonnerie du téléphone pour les commandes proches et les nouvelles réservations.");
      channel.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE),
          new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
      channel.setVibrationPattern(new long[] {0, 500, 250, 700, 250, 700});
      channel.enableVibration(true);
      channel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
      channel.setBypassDnd(false);
      if (legacy != null) {
        // Keep non-audio preferences as well (badges, lockscreen, lights, pattern/group).
        channel.setShowBadge(legacy.canShowBadge());
        channel.setLockscreenVisibility(legacy.getLockscreenVisibility());
        channel.enableLights(legacy.shouldShowLights());
        channel.setLightColor(legacy.getLightColor());
        channel.setGroup(legacy.getGroup());
        if (legacy.getVibrationPattern() != null) channel.setVibrationPattern(legacy.getVibrationPattern());
      }
      manager.createNotificationChannel(channel);
      promise.resolve(manager.getNotificationChannel(PHONE_CHANNEL) != null ? PHONE_CHANNEL : LEGACY_CHANNEL);
    } catch (Exception ignored) {
      // An OEM/settings failure must not prevent login or push registration.
      promise.resolve(LEGACY_CHANNEL);
    }
  }

  private boolean canMigrate(Context context, NotificationManager manager, NotificationChannel channel) {
    if (channel.getImportance() != NotificationManager.IMPORTANCE_HIGH ||
        channel.getSound() == null || !channel.shouldVibrate() || channel.canBypassDnd()) return false;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && channel.hasUserSetImportance()) return false;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && channel.hasUserSetSound()) return false;
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && channel.getGroup() != null) {
      NotificationChannelGroup group = manager.getNotificationChannelGroup(channel.getGroup());
      if (group != null && group.isBlocked()) return false;
    }
    // On older Android versions, conservatively retain unrecognized/custom sound URIs.
    Uri sound = channel.getSound();
    int rawId = context.getResources().getIdentifier("driver_ring", "raw", context.getPackageName());
    return "android.resource".equals(sound.getScheme()) && context.getPackageName().equals(sound.getAuthority()) &&
        ("/raw/driver_ring".equals(sound.getPath()) || (rawId != 0 && ("/" + rawId).equals(sound.getPath())));
  }
}
