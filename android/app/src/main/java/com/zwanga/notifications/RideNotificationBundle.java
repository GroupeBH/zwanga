package com.zwanga.notifications;

import android.app.NotificationManager;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.ArrayList;
import java.util.Map;
import java.util.regex.Pattern;

/** Same IDs/actions as the JS card so unlocking transfers one existing alert. */
final class RideNotificationBundle {
  private static final Pattern UUID = Pattern.compile("(?i)[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}");
  static boolean uuid(String s) { return s != null && UUID.matcher(s).matches(); }
  static boolean channel(String c) { return DriverAlertModule.BUNDLED_CHANNEL.equals(c) ||
      DriverAlertModule.PHONE_CHANNEL.equals(c) || DriverAlertModule.LEGACY_CHANNEL.equals(c); }
  static long date(String s) {
    try {
      if (s == null || !s.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z")) return 0;
      SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", Locale.US);
      format.setLenient(false); return format.parse(s).getTime();
    } catch (Exception e) { return 0; }
  }
  static String kind(Map<String,String> d) {
    if ("new_booking".equals(d.get("type"))) return "booking";
    if ("driver_dispatch_offer".equals(d.get("type"))) return "dispatch";
    return "trip_request_nearby".equals(d.get("type")) ? "nearby" : null;
  }
  static String entity(Map<String,String> d, String kind) {
    return d.get("booking".equals(kind) ? "bookingId" : "dispatch".equals(kind) ? "offerId" : "tripRequestId");
  }
  static boolean valid(Map<String,String> d, long now) {
    String kind = kind(d);
    return kind != null && uuid(entity(d, kind)) && uuid(d.get("notificationId")) && uuid(d.get("driverId")) &&
        !d.get("driverId").equals(d.get("passengerId")) && date(d.get("ringUntil")) > 0 &&
        date(d.get("ringUntil")) + 300000 > now &&
        (!"dispatch".equals(kind) || date(d.get("expiresAt")) > now) &&
        (d.get("alertExpiresAt") == null || date(d.get("alertExpiresAt")) > now);
  }
  static Bundle action(String id) {
    Bundle b = new Bundle(); b.putString("id", id); b.putString("launchActivity", "default"); return b;
  }
  private static Bundle button(String title, String id) {
    Bundle b = new Bundle(); b.putString("title", title); b.putBundle("pressAction", action(id)); return b;
  }
  private static String label(String s) {
    String clean = s == null ? "" : s.substring(0, Math.min(1600, s.length())).replaceAll("<[^>]*>", " ").replaceAll("[\\p{Cntrl}]", " ").replaceAll("\\s+", " ").trim();
    return clean.substring(0, Math.min(160, clean.length()));
  }
  static Bundle create(Context c, Map<String,String> d, String channel, boolean wake) {
    String kind = kind(d), id = "driver-" + kind + "-" + entity(d, kind);
    Bundle card = new Bundle(), data = new Bundle(), android = new Bundle();
    // Exclude Expo fallback rendering instructions, retain business metadata.
    for (Map.Entry<String,String> e : d.entrySet()) if (!"body".equals(e.getKey())) data.putString(e.getKey(), e.getValue());
    long now = System.currentTimeMillis();
    boolean fresh = date(d.get("ringUntil")) > now;
    // A sound starts once within the admission window; reopening never resets it.
    if (fresh) {
      long until = now + 60000;
      if (date(d.get("expiresAt")) > 0) until = Math.min(until, date(d.get("expiresAt")));
      if (date(d.get("alertExpiresAt")) > 0) until = Math.min(until, date(d.get("alertExpiresAt")));
      data.putString("nativeSoundStartedAt", iso(now)); data.putString("nativeSoundUntil", iso(until));
    }
    card.putString("id", id); card.putBundle("data", data);
    card.putString("title", "booking".equals(kind) ? "Zwanga · Nouvelle réservation" : "Zwanga · Nouvelle demande");
    String destination = label(d.get("rideArrival")), departure = label(d.get("rideDeparture")), price = d.get("ridePricePerSeat");
    String body = destination.isEmpty() ? "Un passager vous attend." : (departure.isEmpty() ? "Vers " : departure + " → ") + destination;
    String fare = "";
    if (price != null && price.matches("[0-9]{1,10}(\\.[0-9]{1,2})?") &&
        ("budget".equals(d.get("ridePriceKind")) || "fare".equals(d.get("ridePriceKind")))) {
      double amount = Double.parseDouble(price);
      fare = amount == 0 ? "Gratuit" : ("budget".equals(d.get("ridePriceKind")) ? "Budget : " : "") +
        java.text.NumberFormat.getNumberInstance(Locale.FRANCE).format(amount) + " FC / place";
      card.putString("title", "Zwanga · " + fare);
    }
    // The unlocked full-screen summary reads the body, not the notification title.
    if (!fare.isEmpty()) body = fare + "\n" + body;
    String seats = d.get("rideSeats");
    String details = seats != null && seats.matches("[1-9][0-9]?") ? seats + ("1".equals(seats) ? " place" : " places") : "";
    long departureAt = date(d.get("rideDepartureAt"));
    if (departureAt > 0) {
      SimpleDateFormat schedule = new SimpleDateFormat("dd/MM HH:mm", Locale.FRANCE);
      schedule.setTimeZone(java.util.TimeZone.getTimeZone("Africa/Kinshasa"));
      details += (details.isEmpty() ? "" : " · ") + "Départ : " + schedule.format(new java.util.Date(departureAt));
    }
    if (!details.isEmpty()) body += "\n" + details;
    card.putString("body", body.substring(0, Math.min(body.length(), 900)) + "\nOuvrez Zwanga pour répondre.");
    android.putString("channelId", fresh ? channel : quietChannel(c)); android.putInt("importance", 4); android.putInt("visibility", 0);
    android.putString("smallIcon", "notification_icon");
    android.putBundle("pressAction", action("default")); android.putBoolean("autoCancel", false);
    android.putBoolean("onlyAlertOnce", true); android.putBoolean("loopSound", false);
    Bundle style = new Bundle(); style.putInt("type", 1); style.putString("text", card.getString("body"));
    android.putBundle("style", style);
    if (fresh) android.putString("sound", "driver_ring");
    ArrayList<Bundle> actions = new ArrayList<>();
    actions.add(button("Refuser", "nearby".equals(kind) ? "driver-ignore-nearby" : "driver-decline"));
    actions.add(button("nearby".equals(kind) && "true".equals(d.get("sharedTrip")) ? "Voir la demande" : "Accepter", "nearby".equals(kind) ? "driver-review-nearby" : "driver-accept"));
    android.putParcelableArrayList("actions", actions);
    if ("dispatch".equals(kind)) android.putDouble("timeoutAfter", Math.max(1, date(d.get("expiresAt")) - System.currentTimeMillis()));
    NotificationManager manager = (NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
    KeyguardManager keyguard = (KeyguardManager)c.getSystemService(Context.KEYGUARD_SERVICE);
    PowerManager power = (PowerManager)c.getSystemService(Context.POWER_SERVICE);
    boolean locked = (keyguard != null && keyguard.isKeyguardLocked()) || (power != null && !power.isInteractive());
    if (fresh && wake && (locked || (Build.VERSION.SDK_INT >= 33 && power != null)) && DriverAlertModule.fullScreenBuildEnabled(c) &&
        c.getSharedPreferences("ride-full-screen", 0).getBoolean(d.get("driverId"), false) &&
        (Build.VERSION.SDK_INT < 29 ||
            c.checkSelfPermission("android.permission.USE_FULL_SCREEN_INTENT") == PackageManager.PERMISSION_GRANTED) &&
        manager != null && (Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent())) {
      Bundle full = action("ride-full-screen");
      full.putString("launchActivity", "com.zwanga.notifications.IncomingRideActivity"); full.putString("mainComponent", "main");
      android.putBundle("fullScreenAction", full);
    }
    card.putBundle("android", android); return card;
  }
  static String iso(long value) {
    SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", Locale.US);
    format.setTimeZone(java.util.TimeZone.getTimeZone("UTC")); return format.format(new java.util.Date(value));
  }
  static String quietChannel(Context c) {
    String id = "ride-native-quiet-v1";
    if (Build.VERSION.SDK_INT >= 26) {
      android.app.NotificationChannel quiet = new android.app.NotificationChannel(id, "Demandes à consulter", 3);
      quiet.setSound(null, null); quiet.enableVibration(false);
      ((NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE)).createNotificationChannel(quiet);
    }
    return id;
  }
}
