package com.zwanga.notifications;
import android.content.Context;
import androidx.work.*;
import java.util.Map;
import java.util.HashMap;
import java.util.concurrent.TimeUnit;

/** Durable bounded recovery; live request validation uses no account credentials. */
public final class RideDeliveryWorker extends Worker {
  public RideDeliveryWorker(Context c, WorkerParameters p) { super(c, p); }
  static void enqueue(Context c, Map<String,String> data) {
    if (!RideNotificationBundle.valid(data, System.currentTimeMillis()) || !NativeRideDelivery.owns(c, data.get("driverId"))) return;
    Data.Builder input = new Data.Builder();
    for (Map.Entry<String,String> item : data.entrySet()) input.putString(item.getKey(), item.getValue());
    OneTimeWorkRequest.Builder builder = new OneTimeWorkRequest.Builder(RideDeliveryWorker.class).setInputData(input.build())
        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 10, TimeUnit.SECONDS);
    // Before Android 12 expedited work creates an extra foreground service.
    // Keep immediate regular work there; the initial FCM publication is unchanged.
    if (android.os.Build.VERSION.SDK_INT >= 31) builder.setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST);
    OneTimeWorkRequest task = builder.build();
    WorkManager.getInstance(c).enqueueUniqueWork("ride-display-" + data.get("notificationId"), ExistingWorkPolicy.KEEP, task);
  }
  @Override public Result doWork() {
    Map<String,String> data = new HashMap<>();
    for (Map.Entry<String,Object> entry : getInputData().getKeyValueMap().entrySet())
      if (entry.getValue() instanceof String) data.put(entry.getKey(), (String)entry.getValue());
    return RideCardDelivery.deliver(getApplicationContext(), data) || getRunAttemptCount() >= 2 ? Result.success() : Result.retry();
  }
}
