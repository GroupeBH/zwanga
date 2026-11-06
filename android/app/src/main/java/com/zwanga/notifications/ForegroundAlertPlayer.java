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
import android.os.HandlerThread;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import com.facebook.react.bridge.LifecycleEventListener;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.common.LifecycleState;
import java.util.concurrent.atomic.AtomicLong;

/** One lazy foreground-only player. No service, wake lock or system volume changes. */
final class ForegroundAlertPlayer implements LifecycleEventListener {
  private final ReactApplicationContext context;
  // MediaPlayer and policy/Binder calls share one lazy worker, never the UI looper.
  private HandlerThread audioThread;
  private Handler audio;
  private final Handler main = new Handler(Looper.getMainLooper()); // service/UI handoff only
  private volatile MediaPlayer handoffPlayer;
  private volatile boolean foreground, destroyed;
  private final AtomicLong lifecycleRevision = new AtomicLong();
  private long activeRevision; // audio worker only
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
    audio.removeCallbacks(heartbeatTimeout);
    audio.postDelayed(heartbeatTimeout, HEARTBEAT_TIMEOUT_MS);
  }

  ForegroundAlertPlayer(ReactApplicationContext context) {
    this.context = context;
    foreground = context.getLifecycleState() == LifecycleState.RESUMED;
    context.addLifecycleEventListener(this);
  }

  private synchronized boolean postAudio(Runnable action, boolean create) {
    if (destroyed) return false;
    if (audio == null) {
      if (!create) return false;
      HandlerThread thread = new HandlerThread("ZwangaForegroundAudio");
      try {
        thread.start();
        audio = new Handler(thread.getLooper());
        audioThread = thread;
      } catch (RuntimeException failed) {
        thread.quitSafely();
        return false;
      }
    }
    return audio.post(action);
  }

  private NotificationChannel channel() {
    NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    return Build.VERSION.SDK_INT >= 26 && manager != null ? manager.getNotificationChannel(channelId) : null;
  }
  private boolean allowed() {
    AudioManager audio = (AudioManager) context.getSystemService(Context.AUDIO_SERVICE);
    NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
    if (destroyed || !foreground || activeRevision != lifecycleRevision.get() || audio == null || manager == null ||
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
    if (!foreground || destroyed) { promise.resolve(false); return; }
    final long revision = lifecycleRevision.get();
    if (!postAudio(() -> {
      release(); owner = token; channelId = channel; paused = initiallyPaused; preparing = promise;
      activeRevision = revision;
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
            audio.removeCallbacks(timeout); ready = true;
            if (!allowed()) { release(); return; }
            applyPause();
            if (player == mp) {
              handoffPlayer = mp;
              main.post(() -> {
                if (destroyed || !foreground || revision != lifecycleRevision.get() || handoffPlayer != mp) return;
                try { RideAlertAudioService.handoff(); } catch (Exception ignored) { /* Service expires independently. */ }
              });
              renewHeartbeat();
            }
            Promise pending = preparing; preparing = null;
            if (pending != null) pending.resolve(player == mp);
          } catch (Exception ignored) { release(); }
        });
        audio.postDelayed(timeout, 5000);
        next.prepareAsync();
      } catch (Exception ignored) { release(); }
    }, true)) promise.resolve(false);
  }

  void pause(String token, boolean value) {
    postAudio(() -> {
      if (!token.equals(owner)) return;
      paused = value;
      try { if (ready) applyPause(); } catch (Exception ignored) { release(); }
    }, false);
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
  void stop(String token) { postAudio(() -> { if (token.equals(owner)) release(); }, false); }
  // JS probes only while a foreground alert is pending. A released MediaPlayer
  // must not leave a permanently "ready" JS handle after an asynchronous error.
  void state(String token, Promise promise) {
    if (!postAudio(() -> {
      if (!token.equals(owner) || player == null || !ready) {
        promise.resolve("stopped"); return;
      }
      try {
        if (!allowed()) { release(); promise.resolve("stopped"); return; }
        renewHeartbeat();
        promise.resolve(paused ? "paused" : player.isPlaying() ? "playing" : "stopped");
      } catch (Exception ignored) { release(); promise.resolve("stopped"); }
    }, false)) promise.resolve("stopped");
  }
  private void release() {
    handoffPlayer = null;
    main.removeCallbacksAndMessages(null);
    audio.removeCallbacks(timeout);
    audio.removeCallbacks(heartbeatTimeout);
    MediaPlayer previous = player; player = null; owner = null; ready = false;
    try { vibrate(false); } catch (Exception ignored) { vibrating = false; }
    try { if (previous != null) previous.release(); } catch (Exception ignored) { /* Already released. */ }
    Promise pending = preparing; preparing = null;
    if (pending != null) pending.resolve(false);
  }
  synchronized void destroy() {
    if (destroyed) return;
    destroyed = true; foreground = false; lifecycleRevision.incrementAndGet();
    context.removeLifecycleEventListener(this);
    if (audio != null) audio.post(() -> {
      try { release(); } finally { audioThread.quitSafely(); }
    });
  }
  @Override public void onHostResume() { foreground = !destroyed; /* Only JS starts an alert. */ }
  @Override public void onHostPause() {
    foreground = false; lifecycleRevision.incrementAndGet();
    postAudio(this::release, false);
  }
  // An Activity may be recreated while the React bridge/module survives it.
  @Override public void onHostDestroy() { onHostPause(); }
}
