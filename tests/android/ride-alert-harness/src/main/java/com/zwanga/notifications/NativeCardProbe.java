package com.zwanga.notifications;

import android.content.Context;
import android.os.Bundle;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

/** Synthetic local adapter for the production card builder, without FCM/network. */
public final class NativeCardProbe {
  /** Render the exact production view with public fixtures; no FLAG_SECURE bypass in production. */
  public static void preview(android.app.Activity activity, boolean locked, boolean booking) {
    android.content.Intent intent = activity.getPackageManager().getLaunchIntentForPackage(activity.getPackageName());
    android.app.PendingIntent action = android.app.PendingIntent.getActivity(activity, 901, intent, android.app.PendingIntent.FLAG_IMMUTABLE);
    android.app.Notification card = new android.app.Notification.Builder(activity, DriverAlertModule.BUNDLED_CHANNEL)
      .setSmallIcon(android.R.drawable.ic_dialog_info)
      .addAction(new android.app.Notification.Action.Builder(null, "Refuser", action).build())
      .addAction(new android.app.Notification.Action.Builder(null, "Accepter", action).build()).build();
    IncomingRideView view = new IncomingRideView(activity, booking, card, ignored -> {}, () -> {});
    if (!locked) view.summary.setText("2 500 FC / place\nKasa-Vubu → Gare Centrale\n2 places · Départ : 28/10 16:30");
    if (android.os.Build.VERSION.SDK_INT >= 30) activity.getWindow().setDecorFitsSystemWindows(false);
    activity.getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
    activity.setContentView(view); view.requestApplyInsets();
  }
  /** Exercises the production publisher; supplied identities are local fixtures only. */
  public static void deliver(Context c, String encoded, boolean failPrimary, Runnable done) {
    deliver(c, encoded, failPrimary, "deliver", done);
  }
  public static void deliver(Context c, String encoded, boolean failPrimary, String mode, Runnable done) {
    new Thread(() -> {
      try {
        org.json.JSONObject input = new org.json.JSONObject(new String(android.util.Base64.decode(encoded, android.util.Base64.DEFAULT), java.nio.charset.StandardCharsets.UTF_8));
        Map<String,String> d = new HashMap<>();
        java.util.Iterator<String> keys = input.keys(); while(keys.hasNext()) { String key = keys.next(); d.put(key, input.getString(key)); }
        String channel = DriverAlertModule.BUNDLED_CHANNEL;
        android.app.NotificationManager manager = c.getSystemService(android.app.NotificationManager.class);
        // DriverAlertModule already creates this user's configured channel in AuditRuntime.
        NativeRideDelivery.prefs(c).edit().putString("user", d.get("driverId"))
          .putLong("expires", System.currentTimeMillis()+3600000).putString("channel", channel).commit();
        if ("queue".equals(mode)) RideDeliveryWorker.enqueue(c, d);
        boolean delivered;
        if ("late-deliver".equals(mode)) {
          delivered = RideCardDelivery.deliver(c, d, (card, callback) ->
            new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() ->
              app.notifee.core.Notifee.getInstance().displayNotification(card,
                (error, unused) -> callback.done(error == null ? null : new Exception("LOCAL_DELAYED_FAILURE"))), 2600));
        } else delivered = !"deliver".equals(mode) || (failPrimary ? RideCardDelivery.deliver(c, d, (card, callback) -> callback.done(new Exception("LOCAL_TEST_FAILURE"))) : RideCardDelivery.deliver(c, d));
        org.json.JSONObject result = new org.json.JSONObject().put("completed", delivered)
          .put("audioService", RideAlertAudioService.playbackState())
          .put("receipt", NativeRideDelivery.receipts(c).optJSONObject(d.get("notificationId")))
          .put("systemFullScreenAllowed", android.os.Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent())
          .put("channelReady", DriverAlertModule.fullScreenChannelReady(c, manager));
        String cardId = "driver-"+RideNotificationBundle.kind(d)+"-"+RideNotificationBundle.entity(d, RideNotificationBundle.kind(d));
        int count=0;
        for(var item: manager.getActiveNotifications()) if(item.getId()==cardId.hashCode()) {
          count++; android.app.Notification notification=item.getNotification();
          result.put("channel", notification.getChannelId()).put("actions", notification.actions == null ? 0 : notification.actions.length);
          org.json.JSONArray actionTitles = new org.json.JSONArray();
          if (notification.actions != null) for (var action : notification.actions) actionTitles.put(action.title.toString());
          result.put("actionTitles", actionTitles);
          result.put("template", notification.extras.getString(android.app.Notification.EXTRA_TEMPLATE));
          Bundle card=notification.extras.getBundle("notifee.notification");
          result.put("fullScreenIntent", notification.fullScreenIntent != null).put("restorable",card!=null).put("title",String.valueOf(notification.extras.getCharSequence(android.app.Notification.EXTRA_TITLE)))
            .put("ongoing", (notification.flags & android.app.Notification.FLAG_ONGOING_EVENT) != 0)
            .put("body",String.valueOf(notification.extras.getCharSequence(android.app.Notification.EXTRA_TEXT)));
          if(card!=null) result.put("soundUntil",card.getBundle("data").getString("nativeSoundUntil"));
        }
        result.put("count",count).put("notificationId",d.get("notificationId"));
        try(java.io.FileOutputStream out=c.openFileOutput("ride-audit-result.json",0)) {out.write(result.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));}
        android.util.Log.i("ZwangaAudit", "PRODUCTION_PUBLISHER " + result);
      } catch(Exception e) { android.util.Log.e("ZwangaAudit","PRODUCTION_PUBLISHER_FAILED",e); }
      finally {done.run();}
    }, "local-native-probe").start();
  }
  public static Bundle create(Context c, String channel) {
    SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", Locale.US);
    f.setTimeZone(TimeZone.getTimeZone("UTC"));
    Map<String,String> d = new HashMap<>();
    d.put("driverId", "00000000-0000-4000-8000-000000000001");
    d.put("bookingId", UUID.randomUUID().toString()); d.put("notificationId", UUID.randomUUID().toString());
    d.put("type", "new_booking"); d.put("actionProtocol", "driver-v1"); d.put("nativeAlert", "driver-v6");
    d.put("ringUntil", f.format(new Date(System.currentTimeMillis()+60000)));
    d.put("rideArrival", "Destination TEST LOCAL"); d.put("ridePricePerSeat", "2500"); d.put("ridePriceKind", "fare");
    if (!RideNotificationBundle.valid(d, System.currentTimeMillis())) throw new AssertionError("Invalid synthetic payload");
    return RideNotificationBundle.create(c, d, channel, false);
  }
}
