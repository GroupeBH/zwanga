package com.zwanga.notifications;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.media.AudioManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import java.lang.ref.WeakReference;

/** One opt-in-notification sound session. No boot restart, network, calls or volume override. */
public final class RideAlertAudioService extends Service {
  static final String CHANNEL = "ride-audio-visible-v1";
  private static WeakReference<RideAlertAudioService> active = new WeakReference<>(null);
  private final Handler main = new Handler(Looper.getMainLooper());
  private RideAlertAudioSession player;
  private String id, user, identity, channel;
  private long deadline;
  private boolean foreground, entryReleased, discardCard;
  private volatile boolean closing;
  private int generation;
  private final Runnable tick = new Runnable() { public void run() {
    if (!valid()) { finishAlert(); return; }
    if (!entryReleased && NativeRideDelivery.foreground()) {
      entryReleased = true; releaseBanner(false);
    }
    main.postDelayed(this, 500);
  }};
  static Bundle data(Notification n) {
    Bundle card = n == null || n.extras == null ? null : n.extras.getBundle("notifee.notification");
    return card == null ? null : card.getBundle("data");
  }
  static String identity(Bundle data) {
    return data.getString("notificationId", "") + "|" + data.getString("nativeSoundUntil", data.getString("ringUntil", ""));
  }
  static String originalChannel(Notification n) {
    Bundle data = data(n);
    return data == null ? n.getChannelId() : data.getString("rideAudioChannel", n.getChannelId());
  }
  static long deadline(Bundle data, long now) {
    long end = RideNotificationBundle.date(data.getString("nativeSoundUntil", data.getString("ringUntil")));
    end = Math.min(end, now + 60000);
    for (String key : new String[]{"expiresAt", "alertExpiresAt"}) {
      if (data.containsKey(key)) end = Math.min(end, RideNotificationBundle.date(data.getString(key)));
    }
    return end;
  }
  static boolean allowed(Context c, String channel) {
    try {
      AudioManager audio = (AudioManager)c.getSystemService(AUDIO_SERVICE);
      NotificationManager manager = (NotificationManager)c.getSystemService(NOTIFICATION_SERVICE);
      if (audio == null || manager == null || !manager.areNotificationsEnabled() ||
          audio.getMode() != AudioManager.MODE_NORMAL || audio.getRingerMode() != AudioManager.RINGER_MODE_NORMAL ||
          audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION) == 0 ||
          manager.getCurrentInterruptionFilter() != NotificationManager.INTERRUPTION_FILTER_ALL ||
          !RideNotificationBundle.channel(channel)) return false;
      NotificationChannel settings = manager.getNotificationChannel(channel);
      if (settings == null || settings.getImportance() < 3 || settings.getSound() == null) return false;
      NotificationChannel visible = manager.getNotificationChannel(CHANNEL);
      if (visible != null && (visible.getImportance() < 3 || visible.getSound() != null)) return false;
      NotificationChannelGroup group = Build.VERSION.SDK_INT >= 28 && settings.getGroup() != null ?
        manager.getNotificationChannelGroup(settings.getGroup()) : null;
      return group == null || !group.isBlocked();
    } catch (Exception ignored) { return false; }
  }
  static boolean startPublished(Context c, String id) {
    try {
      if (Build.VERSION.SDK_INT < 26 || id == null || NativeRideDelivery.foreground()) return false;
      Notification live = RidePresentationExpiry.find(c, id); Bundle data = data(live);
      if (data == null || !NativeRideDelivery.owns(c, data.getString("driverId")) ||
          deadline(data, System.currentTimeMillis()) <= System.currentTimeMillis() || !allowed(c, originalChannel(live))) return false;
      c.startForegroundService(new Intent(c, RideAlertAudioService.class).putExtra("card", id).putExtra("identity", identity(data)));
      return true;
    } catch (Exception error) {
      // Includes ForegroundServiceStartNotAllowedException. Preserve the original OS card/sound.
      android.util.Log.w("ZwangaRideAudio", "BACKGROUND_START_UNAVAILABLE"); return false;
    }
  }
  /** Invoked on the main thread only, immediately before the foreground player takes over. */
  static void handoff() { RideAlertAudioService current = active.get(); if (current != null) current.finishAlert(); }
  static boolean preparingForeground(String card) {
    RideAlertAudioService current = active.get();
    return current != null && card != null && card.equals(current.id) && NativeRideDelivery.foreground() && current.valid();
  }
  static void stopPublished(String card) {
    RideAlertAudioService current = active.get();
    if (current != null && card != null && card.equals(current.id)) {
      current.discardCard = true; current.finishAlert();
    }
  }
  static void clearAccount(Context context, String owner) {
    new Handler(Looper.getMainLooper()).post(() -> {
      RideAlertAudioService current = active.get();
      if (current != null && owner != null && owner.equals(current.user)) {
        String card = current.id; current.discardCard = true; current.finishAlert();
        NotificationManager manager = (NotificationManager)context.getSystemService(NOTIFICATION_SERVICE);
        if (manager != null) manager.cancel(card.hashCode());
      }
    });
  }
  public static String playbackState() {
    RideAlertAudioService current = active.get(); return current == null || current.player == null ? "stopped" : current.player.state();
  }
  @Override public IBinder onBind(Intent intent) { return null; }
  @Override public int onStartCommand(Intent intent, int flags, int startId) {
    if (intent == null) { stopSelfResult(startId); return START_NOT_STICKY; }
    String nextId = intent.getStringExtra("card");
    Notification live = nextId == null ? null : RidePresentationExpiry.find(this, nextId);
    Bundle data = data(live);
    if (data == null || !identity(data).equals(intent.getStringExtra("identity")) ||
        !NativeRideDelivery.owns(this, data.getString("driverId")) || NativeRideDelivery.foreground() ||
        deadline(data, System.currentTimeMillis()) <= System.currentTimeMillis() || !allowed(this, originalChannel(live))) {
      if (player == null) stopSelfResult(startId);
      return START_NOT_STICKY;
    }
    if (nextId.equals(id) && identity(data).equals(identity)) return START_NOT_STICKY;
    // Switch one session, never overlap multiple passengers' alerts.
    cleanup(); closing = false; entryReleased = false; discardCard = false;
    final int attempt = ++generation;
    id = nextId; identity = identity(data); user = data.getString("driverId"); channel = originalChannel(live);
    deadline = deadline(data, System.currentTimeMillis());
    try {
      NotificationManager manager = (NotificationManager)getSystemService(NOTIFICATION_SERVICE);
      NotificationChannel visible = new NotificationChannel(CHANNEL, "Alerte de trajet en cours", NotificationManager.IMPORTANCE_HIGH);
      visible.setSound(null, null); visible.enableVibration(false); manager.createNotificationChannel(visible);
      // Same visible card and actions. Moving to a silent rendering channel stops
      // SystemUI's sound before our independent player starts; original settings still govern audio.
      Notification.Builder builder = Notification.Builder.recoverBuilder(this, live).setChannelId(CHANNEL)
        .setOnlyAlertOnce(true).setOngoing(true);
      if (Build.VERSION.SDK_INT >= 31) builder.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
      Notification card = builder.build(); card.extras = new Bundle(card.extras);
      Bundle payload = new Bundle(card.extras.getBundle("notifee.notification"));
      Bundle metadata = new Bundle(data); metadata.putString("rideAudioChannel", channel); payload.putBundle("data", metadata);
      Bundle options = new Bundle(payload.getBundle("android")); options.putString("channelId", CHANNEL); options.putBoolean("loopSound", false);
      options.putBoolean("ongoing", true);
      payload.putBundle("android", options); card.extras.putBundle("notifee.notification", payload);
      card.flags &= ~Notification.FLAG_INSISTENT;
      if (Build.VERSION.SDK_INT >= 29) startForeground(id.hashCode(), card, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
      else startForeground(id.hashCode(), card);
      foreground = true; active = new WeakReference<>(this);
      main.postDelayed(() -> { if (valid()) RidePresentationExpiry.schedulePublished(this, id); }, 150);
      player = new RideAlertAudioSession(this, manager.getNotificationChannel(channel).getSound(),
        Math.max(0, deadline - System.currentTimeMillis()), this::valid,
        () -> main.post(() -> { if (generation == attempt) finishAlert(); }));
      main.post(tick); main.postDelayed(this::finishAlert, Math.max(0, deadline - System.currentTimeMillis()));
    } catch (Exception error) { android.util.Log.w("ZwangaRideAudio", "BACKGROUND_PLAYER_UNAVAILABLE"); finishAlert(); }
    return START_NOT_STICKY;
  }
  private boolean valid() {
    try {
      if (closing || System.currentTimeMillis() >= deadline || !NativeRideDelivery.owns(this, user) || !allowed(this, channel)) return false;
      Bundle current = data(RidePresentationExpiry.find(this, id));
      return current != null && user.equals(current.getString("driverId")) && identity.equals(identity(current));
    } catch (Exception ignored) { return false; }
  }
  private void releaseBanner(boolean releaseAudio) {
    if (id != null) RidePresentationExpiry.releaseNow(this, id, user, identity, releaseAudio);
  }
  private void cleanup() {
    ++generation;
    main.removeCallbacksAndMessages(null);
    if (player != null) player.close(); player = null;
    if (foreground) { stopForeground(discardCard ? STOP_FOREGROUND_REMOVE : STOP_FOREGROUND_DETACH); foreground = false; }
    if (!discardCard) releaseBanner(true);
    // onDestroy runs after JS can have removed the card. Never republish it there.
    id = null; user = null; identity = null; channel = null;
    if (active.get() == this) active.clear();
  }
  private void finishAlert() { if (closing) return; closing = true; cleanup(); stopSelf(); }
  @Override public void onDestroy() { closing = true; cleanup(); super.onDestroy(); }
  @Override public void onTaskRemoved(Intent rootIntent) { finishAlert(); }
}
