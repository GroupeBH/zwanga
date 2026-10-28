package com.zwanga.notifications;

import android.content.Context;
import android.net.Uri;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.BooleanSupplier;

/** Audio and its hard stop must not depend on a responsive Activity/RenderThread. */
final class RideAlertAudioSession {
  private final HandlerThread thread = new HandlerThread("ZwangaRideAudio");
  private final Handler audio;
  private final AtomicBoolean closed = new AtomicBoolean();
  private final Runnable ended;
  private RideAlertAudioPlayer player; // accessed only on the audio looper
  private int attempt, retries;
  private volatile String state = "preparing";

  RideAlertAudioSession(Context c, Uri sound, long duration, BooleanSupplier valid, Runnable ended) {
    this.ended = ended;
    long until = SystemClock.elapsedRealtime() + Math.max(0, duration);
    thread.start(); audio = new Handler(thread.getLooper());
    audio.post(() -> {
      if (closed.get()) return;
      if (!safe(valid) || SystemClock.elapsedRealtime() >= until) { end(); return; }
      start(c, sound, until, valid);
    });
    audio.post(new Runnable() { public void run() {
      if (closed.get()) return;
      if (SystemClock.elapsedRealtime() >= until || !safe(valid)) { end(); return; }
      if (player != null) state = player.state();
      audio.postDelayed(this, 500);
    }});
    audio.postDelayed(this::end, Math.max(0, until - SystemClock.elapsedRealtime()));
  }
  private void start(Context c, Uri sound, long until, BooleanSupplier valid) {
    if (closed.get()) return;
    if (!safe(valid) || SystemClock.elapsedRealtime() >= until) { end(); return; }
    final int generation = ++attempt;
    player = new RideAlertAudioPlayer(c, audio, sound, this::end,
      () -> audio.post(() -> {
        if (closed.get() || generation != attempt) return;
        // Invalidate duplicate errors from this player before releasing it.
        ++attempt;
        if (player != null) player.close();
        player = null;
        if (retries >= 2 || !safe(valid) || SystemClock.elapsedRealtime() >= until) { end(); return; }
        state = "preparing";
        audio.postDelayed(() -> start(c, sound, until, valid), ++retries == 1 ? 300 : 1000);
      }));
  }
  private boolean safe(BooleanSupplier valid) {
    try { return valid.getAsBoolean(); } catch (Exception ignored) { return false; }
  }
  private void end() { if (closed.get()) return; close(); ended.run(); }
  String state() { return state; }
  void close() {
    if (!closed.compareAndSet(false, true)) return;
    state = "stopped";
    audio.removeCallbacksAndMessages(null);
    // Keep MediaPlayer operations on its own looper, including focus and release.
    audio.post(() -> { if (player != null) player.close(); player = null; thread.quitSafely(); });
  }
}
