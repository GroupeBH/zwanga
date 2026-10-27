package com.zwanga.notifications;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import androidx.core.app.NotificationCompat;

/** Last-resort visible card. Its actions open authenticated details only. */
final class RideCardFallback {
  static void display(Context c, Bundle card) {
    Bundle data = card.getBundle("data"), options = card.getBundle("android");
    String type = data.getString("type"), kind = "new_booking".equals(type) ? "booking" : "driver_dispatch_offer".equals(type) ? "dispatch" : "nearby";
    String id = data.getString("booking".equals(kind) ? "bookingId" : "dispatch".equals(kind) ? "offerId" : "tripRequestId");
    Uri.Builder uri = new Uri.Builder().scheme("zwanga");
    if ("nearby".equals(kind)) uri.authority("request-details").appendPath(id);
    else uri.authority("incoming-driver").appendQueryParameter("kind", kind).appendQueryParameter("id", id).appendQueryParameter("driverId", data.getString("driverId"));
    Intent launch = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
    if (launch == null) throw new IllegalStateException("NO_ACTIVITY");
    launch.setAction(Intent.ACTION_VIEW).setData(uri.build()).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    PendingIntent open = PendingIntent.getActivity(c, card.getString("id").hashCode(), launch, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    int icon = c.getResources().getIdentifier("notification_icon", "drawable", c.getPackageName());
    if (icon == 0) icon = c.getApplicationInfo().icon;
    if (icon == 0) icon = android.R.drawable.ic_dialog_info;
    NotificationCompat.Builder builder = new NotificationCompat.Builder(c, options.getString("channelId"))
      .setSmallIcon(icon).setContentTitle(card.getString("title")).setContentText(card.getString("body"))
      .setStyle(new NotificationCompat.BigTextStyle().bigText(card.getString("body")))
      .setContentIntent(open).setAutoCancel(false).setOnlyAlertOnce(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
      .addAction(0, "Voir et accepter", open).addAction(0, "Voir et refuser", open);
    Bundle extras = new Bundle(); extras.putBundle("notifee.notification", card); builder.addExtras(extras);
    if (android.os.Build.VERSION.SDK_INT < 26 && options.containsKey("sound"))
      builder.setPriority(NotificationCompat.PRIORITY_HIGH).setSound(Uri.parse("android.resource://"+c.getPackageName()+"/raw/driver_ring"));
    if (options.containsKey("fullScreenAction")) {
      Intent full = new Intent(c, IncomingRideActivity.class).putExtra("notification", card)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
      builder.setFullScreenIntent(PendingIntent.getActivity(c, card.getString("id").hashCode(), full,
        PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE), true);
    }
    if (options.containsKey("timeoutAfter")) builder.setTimeoutAfter((long)options.getDouble("timeoutAfter"));
    ((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).notify(card.getString("id").hashCode(), builder.build());
  }
}
