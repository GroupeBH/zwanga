package com.zwanga.notifications;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Handler;

/** Independent from SystemUI's single notification sound player. Owned by a bounded FGS. */
final class RideAlertAudioPlayer {
  private final AudioManager audio;
  private final Handler main;
  private MediaPlayer player;
  private AudioFocusRequest focus;
  private boolean ready, waiting, closed;
  private float volume = 1f;
  private final Runnable ended;
  private final Runnable prepareTimeout;

  RideAlertAudioPlayer(Context c, Handler main, Uri sound, Runnable ended) {
    this.audio = (AudioManager)c.getSystemService(Context.AUDIO_SERVICE);
    this.main = main; this.ended = ended; prepareTimeout = ended;
    try {
      AudioAttributes attributes = new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build();
      focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(attributes).setAcceptsDelayedFocusGain(true)
        .setOnAudioFocusChangeListener(this::onFocus, main).build();
      player = new MediaPlayer(); player.setAudioAttributes(attributes);
      player.setDataSource(c, sound); player.setLooping(true);
      player.setOnErrorListener((p, what, extra) -> { if (!closed && player == p) ended.run(); return true; });
      player.setOnPreparedListener(p -> {
        if (closed || p != player) return;
        main.removeCallbacks(prepareTimeout); ready = true;
        try {
          int result = audio.requestAudioFocus(focus);
          if (result == AudioManager.AUDIOFOCUS_REQUEST_FAILED) { ended.run(); return; }
          waiting = result != AudioManager.AUDIOFOCUS_REQUEST_GRANTED; apply();
        } catch (Exception error) { ended.run(); }
      });
      main.postDelayed(prepareTimeout, 5000); player.prepareAsync();
    } catch (Exception error) { main.post(ended); }
  }
  private void onFocus(int change) {
    if (closed) return;
    if (change == AudioManager.AUDIOFOCUS_LOSS) { ended.run(); return; }
    if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) waiting = true;
    else if (change == AudioManager.AUDIOFOCUS_GAIN) { waiting = false; volume = 1f; }
    else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) volume = 0.25f;
    apply();
  }
  private void apply() {
    if (closed || !ready || player == null) return;
    try {
      if (waiting) { if (player.isPlaying()) player.pause(); }
      else { player.setVolume(volume, volume); if (!player.isPlaying()) player.start(); }
    } catch (Exception error) { ended.run(); }
  }
  String state() {
    if (closed) return "stopped";
    if (!ready) return "preparing";
    try { return waiting ? "interrupted" : player.isPlaying() ? "playing" : "stopped"; }
    catch (Exception error) { return "stopped"; }
  }
  void close() {
    if (closed) return;
    closed = true; main.removeCallbacks(prepareTimeout); main.removeCallbacks(ended);
    try { if (focus != null && audio != null) audio.abandonAudioFocusRequest(focus); } catch (Exception ignored) { }
    try { if (player != null) player.release(); } catch (Exception ignored) { }
    player = null;
  }
}
