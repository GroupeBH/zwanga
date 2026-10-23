package com.zwanga.notifications;

import android.app.NotificationChannel;
import android.app.NotificationChannelGroup;
import android.app.NotificationManager;
import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.common.LifecycleState;

/** One lazy foreground-only player. No service, wake lock or system volume changes. */
final class ForegroundAlertPlayer implements LifecycleEventListener {
  private final ReactApplicationContext context;
  private final Handler main = new Handler(Looper.getMainLooper());
  private MediaPlayer player;
  private String owner;
  private String channelId;
  private Promise preparing;
  private boolean ready, paused, vibrating;
  private final Runnable timeout = () -> release();
  // JS checks the pending queue every second and probes this player every 5s.
  // A stalled JS thread must not leave native audio/vibration looping forever.
  // Renew only through a token-scoped health probe, never from playback itself.
  private final Runnable heartbeatTimeout = () -> release();
  private static final long HEARTBEAT_TIMEOUT_MS = 15_000;

  private void renewHeartbeat() {
    main.removeCallbacks(heartbeatTimeout);
    main.postDelayed(heartbeatTimeout, HEARTBEAT_TIMEOUT_MS);
  }

  ForegroundAlertPlayer(ReactApplicationContext context) {
    this.context = context;
    context.addLifecycleEventListener(this);
  }

  private NotificationChannel channel() {
    NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    return Build.VERSION.SDK_INT >= 26 && manager != null ? manager.getNotificationChannel(channelId) : null;
  }
  private boolean allowed() {
    AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (context.getLifecycleState() != LifecycleState.RESUMED || audio == null || manager == null ||
        !manager.areNotificationsEnabled() || audio.getRingerMode() != AudioManager.RINGER_MODE_NORMAL ||
        audio.getStreamVolume(AudioManager.STREAM_NOTIFICATION) == 0 ||
        manager.getCurrentInterruptionFilter() != NotificationManager.INTERRUPTION_FILTER_ALL) return false;
    if (Build.VERSION.SDK_INT >= 26) {
      NotificationChannel channel = channel();
      if (channel == null || channel.getImportance() < NotificationManager.IMPORTANCE_DEFAULT || channel.getSound() == null) return false;
      if (Build.VERSION.SDK_INT >= 28 && channel.getGroup() != null) {
        NotificationChannelGroup group = manager.getNotificationChannelGroup(channel.getGroup());
        if (group != null && group.isBlocked()) return false;
      }
    }
    return true;
  }

  void start(String token, String channel, boolean initiallyPaused, Promise promise) {
    main.post(() -> {
      release(); owner = token; channelId = channel; paused = initiallyPaused; preparing = promise;
      try {
        if (!allowed()) { release(); return; }
        NotificationChannel settings = channel();
        Uri sound = settings != null ? settings.getSound() : Uri.parse("android.resource://" + context.getPackageName() + "/raw/driver_ring");
        MediaPlayer next = new MediaPlayer(); player = next;
        next.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
        next.setDataSource(context, sound);
        next.setLooping(true);
        next.setOnErrorListener((mp, what, extra) -> { if (player == mp) release(); return true; });
        next.setOnPreparedListener(mp -> {
          if (player != mp) return;
          try {
            main.removeCallbacks(timeout); ready = true;
            if (!allowed()) { release(); return; }
            applyPause();
            if (player == mp) renewHeartbeat();
            Promise pending = preparing; preparing = null;
            if (pending != null) pending.resolve(player == mp);
          } catch (Exception ignored) { release(); }
        });
        main.postDelayed(timeout, 5000);
        next.prepareAsync();
      } catch (Exception ignored) { release(); }
    });
  }

  void pause(String token, boolean value) {
    main.post(() -> {
      if (!token.equals(owner)) return;
      paused = value;
      try { if (ready) applyPause(); } catch (Exception ignored) { release(); }
    });
  }
  private void applyPause() {
    if (!allowed()) { release(); return; }
    if (paused) { if (player.isPlaying()) player.pause(); vibrate(false); }
    else { if (!player.isPlaying()) player.start(); vibrate(true); }
  }
  private void vibrate(boolean play) {
    Vibrator vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
    if (vibrator == null) return;
    if (!play) { if (vibrating) vibrator.cancel(); vibrating = false; return; }
    NotificationChannel settings = channel();
    if (play && settings != null && !settings.shouldVibrate()) play = false;
    if (play == vibrating) return;
    vibrating = play;
    if (!play) { vibrator.cancel(); return; }
    long[] pattern = settings != null ? settings.getVibrationPattern() : null;
    if (pattern == null || pattern.length == 0) pattern = new long[] {0, 500, 300, 500, 1200};
    if (Build.VERSION.SDK_INT >= 26) vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
    else vibrator.vibrate(pattern, 0);
  }
  void stop(String token) { main.post(() -> { if (token.equals(owner)) release(); }); }
  // JS probes only while a foreground alert is pending. A released MediaPlayer
  // must not leave a permanently "ready" JS handle after an asynchronous error.
  void state(String token, Promise promise) {
    main.post(() -> {
      if (!token.equals(owner) || player == null || !ready) {
        promise.resolve("stopped"); return;
      }
      try {
        if (!allowed()) { release(); promise.resolve("stopped"); return; }
        renewHeartbeat();
        promise.resolve(paused ? "paused" : player.isPlaying() ? "playing" : "stopped");
      } catch (Exception ignored) { release(); promise.resolve("stopped"); }
    });
  }
  private void release() {
    main.removeCallbacks(timeout);
    main.removeCallbacks(heartbeatTimeout);
    MediaPlayer previous = player; player = null; owner = null; ready = false;
    try { vibrate(false); } catch (Exception ignored) { vibrating = false; }
    try { if (previous != null) previous.release(); } catch (Exception ignored) { /* Already released. */ }
    Promise pending = preparing; preparing = null;
    if (pending != null) pending.resolve(false);
  }
  void destroy() { context.removeLifecycleEventListener(this); main.post(this::release); }
  @Override public void onHostResume() { /* Only JS may start a fresh alert. */ }
  @Override public void onHostPause() { main.post(this::release); }
  @Override public void onHostDestroy() { main.post(this::release); }
}
