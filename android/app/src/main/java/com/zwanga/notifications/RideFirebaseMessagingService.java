package com.zwanga.notifications;
import com.google.firebase.messaging.RemoteMessage;
import expo.modules.notifications.service.ExpoFirebaseMessagingService;
import java.util.Map;
/** Normal messages retain Expo handling; v6 publication precedes React startup. */
public final class RideFirebaseMessagingService extends ExpoFirebaseMessagingService {
  @Override public void onMessageReceived(RemoteMessage message) {
    Map<String,String> data = message.getData();
    if (!"driver-v6".equals(data.get("nativeAlert")) || NativeRideDelivery.foreground()) {
      super.onMessageReceived(message); return;
    }
    // Schedule durable recovery immediately; WorkManager commits asynchronously.
    // Never delay the visible card while waiting for its database.
    try { RideDeliveryWorker.enqueue(this, data); } catch (Exception ignored) { }
    RideCardDelivery.deliver(this, data);
  }
}
