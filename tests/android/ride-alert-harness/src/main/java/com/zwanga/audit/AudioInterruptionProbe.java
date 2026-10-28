package com.zwanga.audit;

import android.app.*;
import android.content.Context;
import android.media.*;
import android.os.*;

/** Local-only competing audio focus client and ordinary audible notification. */
public final class AudioInterruptionProbe {
    private static AudioFocusRequest request;
    public static void focus(Context c, String kind) {
        AudioManager audio = c.getSystemService(AudioManager.class);
        if (request != null) { audio.abandonAudioFocusRequest(request); request = null; }
        if ("release".equals(kind)) return;
        int gain = "permanent".equals(kind) ? AudioManager.AUDIOFOCUS_GAIN :
            "duck".equals(kind) ? AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK : AudioManager.AUDIOFOCUS_GAIN_TRANSIENT;
        request = new AudioFocusRequest.Builder(gain)
            .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build())
            .setOnAudioFocusChangeListener(change -> {}, new Handler(Looper.getMainLooper())).build();
        AuditRuntime.log("FOCUS_PROBE " + kind + " " + audio.requestAudioFocus(request));
    }
    public static void notification(Context c) {
        NotificationManager manager = c.getSystemService(NotificationManager.class);
        NotificationChannel channel = new NotificationChannel("audit-other-audible", "Autre notification TEST", 4);
        channel.setSound(android.provider.Settings.System.DEFAULT_NOTIFICATION_URI,
            new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build());
        manager.createNotificationChannel(channel);
        manager.notify(721, new Notification.Builder(c, channel.getId()).setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Autre notification · TEST LOCAL").setContentText("Interruption sonore indépendante").setTimeoutAfter(4000).build());
    }
}
