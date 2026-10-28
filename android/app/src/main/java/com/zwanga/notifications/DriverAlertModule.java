package com.zwanga.notifications;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
import android.app.NotificationManager;
import android.app.KeyguardManager;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.provider.Settings;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/** Channel setup and bounded audio handoff; no global volume override. */
public final class DriverAlertModule extends ReactContextBaseJavaModule {
  static final String LEGACY_CHANNEL = "booking-ring-v2";
  static final String PHONE_CHANNEL = "driver-phone-ring-v3";
  static final String BUNDLED_CHANNEL = "zwanga-ride-ring-v4";
  private ForegroundAlertPlayer foreground;

  public DriverAlertModule(ReactApplicationContext context) { super(context); NativeRideDelivery.attach(context); }

  @ReactMethod(isBlockingSynchronousMethod = true)
  public int bindNativeRideAccount(String user, double expires, String channel) {
    return NativeRideDelivery.bind(getReactApplicationContext(), user, expires, channel);
  }
  @ReactMethod(isBlockingSynchronousMethod = true)
  public boolean clearNativeRideAccount() { NativeRideDelivery.clear(getReactApplicationContext()); return true; }
  @ReactMethod public void getNativeRideReceipts(String user, Promise promise) {
    promise.resolve(NativeRideDelivery.pendingReceipts(getReactApplicationContext(), user));
  }
  @ReactMethod public void recordNativeRideReceipt(String user, String id, boolean displayed, String card) {
    if (RideNotificationBundle.uuid(user) && RideNotificationBundle.uuid(id))
      NativeRideDelivery.receipt(getReactApplicationContext(), user, id, displayed, card);
  }

  @Override public String getName() { return "ZwangaDriverAlerts"; }

  // Native capability is configured by withIncomingRideAlerts, never via OTA.
  // Driver consent and Android special access remain required before presentation.
  static boolean fullScreenBuildEnabled(Context context) {
    try {
      android.os.Bundle meta = context.getPackageManager().getApplicationInfo(
          context.getPackageName(), PackageManager.GET_META_DATA).metaData;
      return meta != null && meta.getBoolean("com.zwanga.RIDE_FULL_SCREEN_ENABLED", false);
    } catch (Exception ignored) { return false; }
  }
  @ReactMethod public void getFullScreenOptIn(String userId, Promise promise) {
    Context context = getReactApplicationContext();
    promise.resolve(fullScreenBuildEnabled(context) ?
        context.getSharedPreferences("ride-full-screen", Context.MODE_PRIVATE).getBoolean(userId, false) : null);
  }
  @ReactMethod public void getFullScreenStatus(String userId, Promise promise) {
    try {
      Context context = getReactApplicationContext();
      if (!fullScreenBuildEnabled(context) || userId == null || userId.isEmpty() || userId.length() > 64) {
        promise.resolve(null); return;
      }
      NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      WritableMap status = Arguments.createMap();
      status.putBoolean("optIn", context.getSharedPreferences("ride-full-screen", Context.MODE_PRIVATE).getBoolean(userId, false));
      status.putBoolean("allowed", (Build.VERSION.SDK_INT < 29 ||
          context.checkSelfPermission("android.permission.USE_FULL_SCREEN_INTENT") == PackageManager.PERMISSION_GRANTED) &&
          manager != null && (Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent()));
      status.putBoolean("notificationsAllowed", manager != null && manager.areNotificationsEnabled());
      status.putBoolean("channelReady", fullScreenChannelReady(context, manager));
      promise.resolve(status);
    } catch (Exception ignored) { promise.reject("FULL_SCREEN_STATUS_UNAVAILABLE", "Impossible de lire l’autorisation plein écran."); }
  }
  /** Read the active alert channel without recreating/resetting a user's settings. */
  static boolean fullScreenChannelReady(Context context, NotificationManager manager) {
    if (manager == null) return false;
    if (Build.VERSION.SDK_INT < 26) return true;
    String id = NativeRideDelivery.prefs(context).getString("channel", BUNDLED_CHANNEL);
    if (!RideNotificationBundle.channel(id)) id = BUNDLED_CHANNEL;
    NotificationChannel channel = manager.getNotificationChannel(id);
    if (channel == null) channel = manager.getNotificationChannel(PHONE_CHANNEL);
    if (channel == null) channel = manager.getNotificationChannel(LEGACY_CHANNEL);
    if (channel == null || channel.getImportance() < NotificationManager.IMPORTANCE_HIGH) return false;
    if (Build.VERSION.SDK_INT >= 28 && channel.getGroup() != null) {
      NotificationChannelGroup group = manager.getNotificationChannelGroup(channel.getGroup());
      if (group != null && group.isBlocked()) return false;
    }
    return presentationChannelReady(manager);
  }
  static boolean presentationChannelReady(NotificationManager manager) {
    if (Build.VERSION.SDK_INT < 26) return true;
    NotificationChannel channel = manager.getNotificationChannel("ride-audio-visible-v1");
    if (channel == null) return true; // Not created until the first native audio session.
    if (channel.getImportance() < NotificationManager.IMPORTANCE_HIGH || channel.getSound() != null) return false;
    NotificationChannelGroup group = Build.VERSION.SDK_INT >= 28 && channel.getGroup() != null ?
      manager.getNotificationChannelGroup(channel.getGroup()) : null;
    return group == null || !group.isBlocked();
  }
  @ReactMethod public void getFullScreenSettingsChannel(Promise promise) {
    try {
    Context context = getReactApplicationContext();
    NotificationManager manager = (NotificationManager)context.getSystemService(Context.NOTIFICATION_SERVICE);
    String channel = NativeRideDelivery.prefs(context).getString("channel", BUNDLED_CHANNEL);
    promise.resolve(manager != null && !presentationChannelReady(manager) ? "ride-audio-visible-v1" :
      RideNotificationBundle.channel(channel) ? channel : BUNDLED_CHANNEL);
    } catch (Exception ignored) { promise.reject("FULL_SCREEN_STATUS_UNAVAILABLE", "Impossible de lire les réglages des alertes."); }
  }
  @ReactMethod public void setFullScreenOptIn(String userId, boolean enabled, Promise promise) {
    Context context = getReactApplicationContext();
    if (!fullScreenBuildEnabled(context) || userId == null || userId.isEmpty() || userId.length() > 64) { promise.resolve(false); return; }
    android.app.Activity activity = getCurrentActivity();
    if (enabled && (activity == null || activity.isFinishing() || activity.isDestroyed())) { promise.resolve(false); return; }
    if (enabled && Build.VERSION.SDK_INT >= 34) {
      NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      if (manager == null) { promise.resolve(false); return; }
      if (!manager.canUseFullScreenIntent()) {
        try {
          activity.startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
              Uri.parse("package:" + context.getPackageName())));
        } catch (Exception ignored) { promise.resolve(false); return; }
      }
    }
    context.getSharedPreferences("ride-full-screen", Context.MODE_PRIVATE).edit().putBoolean(userId, enabled).apply();
    promise.resolve(true);
  }
  /** Explicit user action: review the real Android grant, even if it is already allowed.
   * Opening Settings records local consent only; getFullScreenStatus remains authoritative. */
  @ReactMethod public void requestFullScreenPermission(String userId, Promise promise) {
    Context context = getReactApplicationContext();
    if (!fullScreenBuildEnabled(context) || userId == null || userId.isEmpty() || userId.length() > 64) {
      promise.resolve(false); return;
    }
    long deadline = android.os.SystemClock.elapsedRealtime() + 1800;
    new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
      android.app.Activity activity = getCurrentActivity();
      if (android.os.SystemClock.elapsedRealtime() >= deadline || activity == null ||
          activity.isFinishing() || activity.isDestroyed() ||
          getReactApplicationContext().getLifecycleState() != com.facebook.react.common.LifecycleState.RESUMED) {
        promise.resolve(false); return;
      }
      if (Build.VERSION.SDK_INT < 34) { setFullScreenOptIn(userId, true, promise); return; }
      try {
        // Do not gate opening on canUseFullScreenIntent(): a tap must let the driver
        // inspect the OS choice, not just toggle Zwanga's preference and close a modal.
        activity.startActivity(new Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
            Uri.parse("package:" + context.getPackageName())));
        context.getSharedPreferences("ride-full-screen", Context.MODE_PRIVATE).edit().putBoolean(userId, true).apply();
        promise.resolve("settings-opened");
      } catch (Exception ignored) { promise.resolve(false); }
    });
  }
  @ReactMethod public void canPresentFullScreen(String userId, Promise promise) {
    try {
      Context context = getReactApplicationContext();
      NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      KeyguardManager keyguard = (KeyguardManager) context.getSystemService(Context.KEYGUARD_SERVICE);
      PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
      promise.resolve(fullScreenBuildEnabled(context) && userId != null &&
          context.getSharedPreferences("ride-full-screen", Context.MODE_PRIVATE).getBoolean(userId, false) &&
          (Build.VERSION.SDK_INT < 29 ||
              context.checkSelfPermission("android.permission.USE_FULL_SCREEN_INTENT") == PackageManager.PERMISSION_GRANTED) &&
          manager != null && manager.areNotificationsEnabled() &&
          // Android 13+ keeps a heads-up surface when unlocked; it does not
          // launch our activity over another foreground app. Older APIs keep
          // the conservative locked/screen-off restriction.
          ((Build.VERSION.SDK_INT >= 33 && power != null) || (keyguard != null && keyguard.isKeyguardLocked()) || (power != null && !power.isInteractive())) &&
          (Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent()));
    } catch (Exception ignored) { promise.resolve(false); }
  }

  @ReactMethod public void boundFullScreenPresentation(String id, Promise promise) {
    Context context = getReactApplicationContext();
    // notify() can return before the system notification list is updated.
    new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() ->
      promise.resolve(RidePresentationExpiry.schedulePublished(context, id)), 150);
  }

  @ReactMethod public void startBackgroundAlertSound(String id, Promise promise) {
    Context context = getReactApplicationContext();
    new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() ->
      promise.resolve(RideAlertAudioService.startPublished(context, id)), 150);
  }
  @ReactMethod public void stopBackgroundAlertSound(String id, Promise promise) {
    new android.os.Handler(android.os.Looper.getMainLooper()).post(() -> {
      RideAlertAudioService.stopPublished(id); promise.resolve(true);
    });
  }
  @ReactMethod public void prepareForegroundAlert(String id, Promise promise) {
    new android.os.Handler(android.os.Looper.getMainLooper()).post(() ->
      promise.resolve(RideAlertAudioService.preparingForeground(id)));
  }

  @ReactMethod
  public void startForegroundSound(String token, String channelId, boolean paused, Promise promise) {
    if (foreground == null) foreground = new ForegroundAlertPlayer(getReactApplicationContext());
    foreground.start(token, channelId, paused, promise);
  }
  @ReactMethod
  public void pauseForegroundSound(String token, boolean paused) {
    if (foreground != null) foreground.pause(token, paused);
  }
  @ReactMethod
  public void stopForegroundSound(String token) {
    if (foreground != null) foreground.stop(token);
  }
  @ReactMethod
  public void getForegroundSoundState(String token, Promise promise) {
    if (foreground == null) promise.resolve("stopped");
    else foreground.state(token, promise);
  }
  @Override public void invalidate() {
    if (foreground != null) { foreground.destroy(); foreground = null; }
    super.invalidate();
  }

  @ReactMethod
  public void ensureBundledChannel(Promise promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
        promise.resolve(LEGACY_CHANNEL);
        return;
      }
      Context context = getReactApplicationContext();
      NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      if (manager == null) { promise.resolve(LEGACY_CHANNEL); return; }
      // Never recreate/reset an existing channel, including one muted by the user.
      if (manager.getNotificationChannel(BUNDLED_CHANNEL) != null) {
        promise.resolve(BUNDLED_CHANNEL);
        return;
      }
      NotificationChannel legacy = manager.getNotificationChannel(PHONE_CHANNEL);
      if (legacy == null) legacy = manager.getNotificationChannel(LEGACY_CHANNEL);
      if (legacy != null && !canMigrate(context, manager, legacy)) {
        promise.resolve(legacy.getId());
        return;
      }
      NotificationChannel channel = new NotificationChannel(BUNDLED_CHANNEL,
          "Nouveaux clients et réservations", NotificationManager.IMPORTANCE_HIGH);
      channel.setDescription("Sonnerie Zwanga pour les commandes proches et les réservations.");
      channel.setSound(Uri.parse("android.resource://" + context.getPackageName() + "/raw/driver_ring"),
          new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
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
      promise.resolve(manager.getNotificationChannel(BUNDLED_CHANNEL) != null ? BUNDLED_CHANNEL : LEGACY_CHANNEL);
    } catch (Exception ignored) {
      // An OEM/settings failure must not prevent login or push registration.
      promise.resolve(LEGACY_CHANNEL);
    }
  }

  @ReactMethod
  public void canPlayForegroundRingtone(Promise promise) {
    try {
      Context context = getReactApplicationContext();
      AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
      NotificationManager notifications = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      promise.resolve(audio != null && audio.getRingerMode() == AudioManager.RINGER_MODE_NORMAL &&
          audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION) > 0 && notifications != null &&
          notifications.getCurrentInterruptionFilter() == NotificationManager.INTERRUPTION_FILTER_ALL);
    } catch (Exception ignored) { promise.resolve(false); }
  }

  @ReactMethod
  public void canLightUpAlertScreen(String channelId, Promise promise) {
    promise.resolve(allowsAlertScreenWake(getReactApplicationContext(), channelId));
  }

  /** Best effort only: OEM/Android policy may deny the legacy wake request.
   * The visible notification and consented full-screen intent remain primary.
   * Unlike Notifee lightUpScreen, this runs AFTER publication, uses a timeout,
   * and never takes an additional unbounded CPU wake lock. */
  @SuppressWarnings("deprecation")
  @ReactMethod
  public void wakeDisplayedAlert(String notificationId, String channelId, double deadline, Promise promise) {
    try {
      Context context = getReactApplicationContext();
      if (notificationId == null || channelId == null || Double.isNaN(deadline) || Double.isInfinite(deadline) ||
          deadline <= System.currentTimeMillis()) { promise.resolve("expired"); return; }
      if (!allowsAlertScreenWake(context, channelId)) { promise.resolve("settings"); return; }
      PowerManager power = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
      if (power == null) { promise.resolve("unavailable"); return; }
      if (power.isInteractive()) { promise.resolve("already-on"); return; }
      NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      boolean displayed = false;
      if (manager != null) for (android.service.notification.StatusBarNotification item : manager.getActiveNotifications()) {
        if (item.getTag() == null && item.getId() == notificationId.hashCode() &&
            (Build.VERSION.SDK_INT < 26 || matchesAlertChannel(item.getNotification(), channelId))) {
          displayed = true; break;
        }
      }
      if (!displayed || deadline <= System.currentTimeMillis()) { promise.resolve("not-displayed"); return; }
      if (context.checkSelfPermission("android.permission.WAKE_LOCK") != PackageManager.PERMISSION_GRANTED) {
        promise.resolve("permission"); return;
      }
      PowerManager.WakeLock lock = power.newWakeLock(
          PowerManager.SCREEN_DIM_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
          "Zwanga:ride-alert");
      lock.setReferenceCounted(false);
      lock.acquire(1500);
      promise.resolve("requested"); // Not proof that SystemUI displayed the lock screen.
    } catch (SecurityException ignored) { promise.resolve("permission"); }
    catch (Exception ignored) { promise.resolve("unavailable"); }
  }

  static boolean allowsAlertScreenWake(Context context, String channelId) {
    try {
      NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
      AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
      if (manager == null || !manager.areNotificationsEnabled() || audio == null ||
          audio.getRingerMode() != AudioManager.RINGER_MODE_NORMAL ||
          audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION) == 0 ||
          manager.getCurrentInterruptionFilter() != NotificationManager.INTERRUPTION_FILTER_ALL) {
        return false;
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        NotificationChannel channel = manager.getNotificationChannel(channelId);
        if (channel == null || channel.getImportance() < NotificationManager.IMPORTANCE_HIGH || channel.getSound() == null) {
          return false;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && channel.getGroup() != null) {
          NotificationChannelGroup group = manager.getNotificationChannelGroup(channel.getGroup());
          if (group != null && group.isBlocked()) return false;
        }
      }
      return true;
    } catch (Exception ignored) { return false; }
  }

  static boolean matchesAlertChannel(Notification notification, String channel) {
    if (channel.equals(notification.getChannelId())) return true;
    if (!"ride-audio-visible-v1".equals(notification.getChannelId()) || notification.extras == null) return false;
    android.os.Bundle card = notification.extras.getBundle("notifee.notification");
    android.os.Bundle data = card == null ? null : card.getBundle("data");
    return data != null && channel.equals(data.getString("rideAudioChannel"));
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
    if (PHONE_CHANNEL.equals(channel.getId()))
      return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE).equals(sound);
    int rawId = context.getResources().getIdentifier("driver_ring", "raw", context.getPackageName());
    return "android.resource".equals(sound.getScheme()) && context.getPackageName().equals(sound.getAuthority()) &&
        ("/raw/driver_ring".equals(sound.getPath()) || (rawId != 0 && ("/" + rawId).equals(sound.getPath())));
  }
}
