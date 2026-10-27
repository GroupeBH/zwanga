package com.zwanga.notifications;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.common.LifecycleState;
import java.lang.ref.WeakReference;
import java.util.Iterator;
import org.json.JSONObject;

/** Small account boundary and receipt ledger; no credentials or location stored. */
final class NativeRideDelivery {
  private static WeakReference<ReactApplicationContext> react = new WeakReference<>(null);
  static final Object LOCK = new Object();
  static SharedPreferences prefs(Context c) { return c.getSharedPreferences("native-ride-delivery", 0); }
  static void attach(ReactApplicationContext c) { react = new WeakReference<>(c); }
  static boolean foreground() {
    ReactApplicationContext c = react.get();
    return c != null && c.getLifecycleState() == LifecycleState.RESUMED && c.getCurrentActivity() != null;
  }
  static boolean owns(Context c, String user) {
    return user != null && user.equals(prefs(c).getString("user", "")) &&
        prefs(c).getLong("expires", 0) > System.currentTimeMillis();
  }
  static int bind(Context c, String user, double expires, String channel) {
    synchronized (LOCK) {
      if (!foreground() || !RideNotificationBundle.uuid(user) || !Double.isFinite(expires) ||
          expires <= System.currentTimeMillis() || !RideNotificationBundle.channel(channel)) return 0;
      if (!user.equals(prefs(c).getString("user", ""))) clear(c);
      prefs(c).edit().putString("user", user).putLong("expires", (long) expires).putString("channel", channel).apply();
      return 6;
    }
  }
  static void clear(Context c) {
    synchronized (LOCK) {
      android.app.NotificationManager manager = (android.app.NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE);
      JSONObject items = receipts(c);
      Iterator<String> keys = items.keys();
      while (keys.hasNext()) {
        JSONObject item = items.optJSONObject(keys.next());
        if (manager != null && item != null && item.has("card")) manager.cancel(item.optString("card").hashCode());
      }
      prefs(c).edit().clear().apply();
    }
  }
  static JSONObject receipts(Context c) {
    try { return new JSONObject(prefs(c).getString("receipts", "{}")); }
    catch (Exception ignored) { return new JSONObject(); }
  }
  static boolean seen(Context c, String id) {
    JSONObject item = receipts(c).optJSONObject(id);
    return item != null && (item.optBoolean("displayed") || item.optLong("attemptAt") > System.currentTimeMillis() - 5000);
  }
  static void receipt(Context c, String user, String id, boolean displayed) {
    receipt(c, user, id, displayed, null);
  }
  static void receipt(Context c, String user, String id, boolean displayed, String card) {
    synchronized (LOCK) {
      if (!owns(c, user)) return;
      try {
        JSONObject items = receipts(c);
        JSONObject item = items.optJSONObject(id);
        if (item == null) item = new JSONObject().put("at", System.currentTimeMillis());
        if (!displayed) item.put("attemptAt", System.currentTimeMillis());
        item.put("displayed", displayed || item.optBoolean("displayed"));
        if (displayed && !item.has("displayedAt")) item.put("displayedAt", System.currentTimeMillis());
        if (card != null && card.matches("driver-(booking|dispatch|nearby)-[0-9a-fA-F-]{36}")) item.put("card", card);
        items.put(id, item);
        while (items.length() > 100) {
          String oldest = null; long time = Long.MAX_VALUE;
          Iterator<String> keys = items.keys();
          while (keys.hasNext()) { String key = keys.next(); long at = items.getJSONObject(key).optLong("at");
            if (at < time) { time = at; oldest = key; } }
          if (oldest == null) break; items.remove(oldest);
        }
        prefs(c).edit().putString("receipts", items.toString()).apply();
      } catch (Exception ignored) { /* Receipt failure never prevents presentation. */ }
    }
  }
  static String pendingReceipts(Context c, String user) {
    synchronized (LOCK) { return owns(c, user) ? receipts(c).toString() : "{}"; }
  }
  static void failure(Context c, String user, String id, String code) {
    synchronized (LOCK) {
      if (!owns(c, user)) return;
      try {
        JSONObject items = receipts(c), item = items.optJSONObject(id);
        if (item != null) { item.put("failureCode", code); prefs(c).edit().putString("receipts", items.toString()).apply(); }
      } catch (Exception ignored) { }
    }
  }
}
