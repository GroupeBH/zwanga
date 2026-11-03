package com.zwanga.notifications;

import android.content.Context;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.json.JSONObject;

/** Read-only invitation capability; no refresh/access token in native storage. */
final class RideRingValidation {
  static boolean required(Map<String,String> data) {
    return "trip_request_nearby".equals(data.get("type")) || "driver_dispatch_offer".equals(data.get("type"));
  }
  static boolean configure(Context c, String user, String base) {
    if (!NativeRideDelivery.owns(c, user)) return false;
    try {
      URL url = new URL(base);
      boolean debug = (c.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0;
      String host = url.getHost();
      boolean local = host.equals("localhost") || host.equals("127.0.0.1") || host.matches("10\\.\\d+\\.\\d+\\.\\d+") || host.matches("192\\.168\\.\\d+\\.\\d+");
      if (!(url.getProtocol().equals("https") || (debug && local && url.getProtocol().equals("http"))) ||
          url.getUserInfo() != null || url.getQuery() != null || url.getRef() != null) return false;
      // Only the bundled JS configuration supplies this URL, never a push field.
      NativeRideDelivery.prefs(c).edit().putString("validationBase", base.replaceAll("/+$", "")).apply();
      return true;
    } catch (Exception ignored) { return false; }
  }
  /** 1=allow, 0=definitive denial, -1=transient failure (bounded worker retry). */
  static int check(Context c, Map<String,String> data) {
    if (!required(data)) return 1;
    String token = data.get("ringValidationToken");
    String base = NativeRideDelivery.prefs(c).getString("validationBase", "");
    if (token == null || token.isEmpty() || token.length() > 256 || base.isEmpty() ||
        RideNotificationBundle.date(data.get("ringUntil")) <= System.currentTimeMillis()) return 0;
    HttpURLConnection connection = null;
    try {
      connection = (HttpURLConnection)new URL(base + "/notifications/ride-alerts/validate").openConnection();
      connection.setInstanceFollowRedirects(false);
      connection.setConnectTimeout(1500); connection.setReadTimeout(1500);
      connection.setRequestMethod("POST"); connection.setDoOutput(true);
      connection.setRequestProperty("Content-Type", "application/json");
      byte[] body = new JSONObject().put("token", token).toString().getBytes(StandardCharsets.UTF_8);
      connection.setFixedLengthStreamingMode(body.length);
      try (java.io.OutputStream out = connection.getOutputStream()) { out.write(body); }
      int status = connection.getResponseCode();
      if (status == 429 || status >= 500) return -1;
      if (status != 200) return 0;
      java.io.ByteArrayOutputStream content = new java.io.ByteArrayOutputStream();
      long until = android.os.SystemClock.elapsedRealtime() + 1500;
      try (java.io.InputStream in = connection.getInputStream()) {
        byte[] buffer = new byte[256]; int n;
        while ((n = in.read(buffer)) != -1) {
          if (content.size() + n > 1024 || android.os.SystemClock.elapsedRealtime() > until) return -1;
          content.write(buffer, 0, n);
        }
      }
      return new JSONObject(content.toString("UTF-8")).optBoolean("allowed", false) &&
        NativeRideDelivery.owns(c, data.get("driverId")) &&
        RideNotificationBundle.date(data.get("ringUntil")) > System.currentTimeMillis() ? 1 : 0;
    } catch (Exception ignored) { return -1; }
    finally { if (connection != null) connection.disconnect(); }
  }
  static boolean fresh(Map<String,String> data, long checkedUntil) {
    return !required(data) || (android.os.SystemClock.elapsedRealtime() < checkedUntil &&
      RideNotificationBundle.date(data.get("ringUntil")) > System.currentTimeMillis());
  }
}
