const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const sourcePath = 'native/android/notifications/IncomingRideActivity.java';
const source = fs.readFileSync(sourcePath, 'utf8');
function directory(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-lock-screen-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  return temp;
}
function compile(args) {
  const result = spawnSync('javac', ['-encoding', 'UTF-8', ...args], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
}

test('native ticket formats real payload fields and fails safely on missing or malformed data', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const temp = directory(t), file = path.join(temp, 'RideContentCheck.java');
  fs.writeFileSync(file, `
package com.zwanga.notifications;
import java.util.HashMap;
import java.util.Map;
import java.util.TimeZone;
public class RideContentCheck {
  static void check(boolean ok) { if (!ok) throw new AssertionError(); }
  public static void main(String[] args) {
    Map<String,String> fields = new HashMap<>();
    IncomingRideContent empty = new IncomingRideContent(fields);
    check(empty.price.equals("Prix à consulter") && empty.passenger.isEmpty());
    check(empty.seats.isEmpty() && empty.reference.isEmpty() && empty.schedule.isEmpty());
    fields.put("ridePricePerSeat", "11000"); fields.put("ridePriceKind", "fare");
    fields.put("rideSeats", "1"); fields.put("rideDepartureAt", "2026-11-01T08:30:00.000Z");
    fields.put("tripRequestId", "00000000-0000-4000-8000-000000000001");
    fields.put("rideDeparture", "<b>Ngafula</b>\\n"); fields.put("rideArrival", "Gare Centrale, Gombe");
    fields.put("passengerName", "Passager de test");
    TimeZone.setDefault(TimeZone.getTimeZone("Pacific/Honolulu"));
    IncomingRideContent fare = new IncomingRideContent(fields);
    check(fare.price.replaceAll("[\\\\s\\\\p{Z}]", "").equals("11000FC") && fare.priceLabel.equals("pour le trajet"));
    check(fare.departure.equals("Ngafula") && fare.arrival.equals("Gare Centrale, Gombe"));
    check(fare.seats.equals("1 place") && fare.schedule.endsWith("09:30"));
    check(fare.reference.equals("Réf. 00000000") && fare.passenger.equals("Passager de test"));
    fields.put("ridePriceKind", "budget"); fields.put("rideSeats", "2");
    check(new IncomingRideContent(fields).priceLabel.equals("Budget du trajet"));
    check(new IncomingRideContent(fields).price.replaceAll("[\\\\s\\\\p{Z}]", "").equals("22000FC"));
    fields.put("type", "new_booking");
    check(new IncomingRideContent(fields).priceLabel.equals("Budget par place"));
    check(IncomingRideContent.displayedPrice(fields) == 11000);
    fields.put("type", "trip_request_nearby");
    fields.remove("rideSeats"); check(IncomingRideContent.displayedPrice(fields) == null);
    fields.put("rideSeats", "2");
    check(new IncomingRideContent(fields).seats.equals("2 places"));
    fields.put("ridePricePerSeat", "0"); check(new IncomingRideContent(fields).price.equals("Gratuit"));
    for (String invalid : new String[]{"-5", "NaN", "Infinity", "0.001", "1e3", "99999999999", "<b>10</b>"}) {
      fields.put("ridePricePerSeat", invalid); check(new IncomingRideContent(fields).price.equals("Prix à consulter"));
    }
    fields.put("ridePricePerSeat", "1200"); fields.put("ridePriceKind", "unknown");
    check(new IncomingRideContent(fields).price.equals("Prix à consulter"));
    fields.put("rideSeats", "0"); fields.put("bookingId", "not-a-reference");
    check(new IncomingRideContent(fields).seats.isEmpty() && new IncomingRideContent(fields).reference.isEmpty());
    for (String invalid : new String[]{"2026-02-30T08:30:00.000Z", "2026-11-01T99:30:00.000Z", "tomorrow"}) {
      fields.put("rideDepartureAt", invalid); check(new IncomingRideContent(fields).schedule.isEmpty());
    }
    String hostile = "<b>Lieu</b>\\u202e\\u0000\\n    connu";
    check(IncomingRideContent.label(hostile, 160).equals("Lieu connu"));
    check(IncomingRideContent.label("x".repeat(4000), 160).length() == 161);
    check(IncomingRideContent.label("x".repeat(159) + "🚗", 160).equals("x".repeat(159) + "…"));
    check(IncomingRideContent.countdown(34000).equals("0:34"));
    check(IncomingRideContent.countdown(1).equals("0:01"));
    check(IncomingRideContent.countdown(-1000).equals("0:00"));
    check(IncomingRideContent.countdown(Long.MAX_VALUE).equals("1:00"));
    check(IncomingRideContent.countdown(Long.MIN_VALUE).equals("0:00"));
  }
}`);
  compile(['-d', temp, 'native/android/notifications/IncomingRideContent.java', file]);
  const result = spawnSync('java', ['-cp', temp, 'com.zwanga.notifications.RideContentCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
});

test('the actual incoming activity compiles against the installed Android SDK without RN or another dependency', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const roots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'AppData/Local/Android/Sdk')].filter(Boolean);
  const sdk = roots.map(root => path.join(root, 'platforms/android-36/android.jar')).find(file => fs.existsSync(file));
  if (!sdk) return t.skip('Android API 36 SDK required');
  const temp = directory(t), stub = path.join(temp, 'DriverAlertModule.java');
  // Only its existing build flag bridge is stubbed. Android APIs resolve from
  // the real SDK. This is not a Gradle, installation or physical-device test.
  fs.writeFileSync(stub, 'package com.zwanga.notifications; class DriverAlertModule { static boolean fullScreenBuildEnabled(android.content.Context context) { return true; } }');
  compile(['-classpath', sdk, '-d', temp, stub, sourcePath, 'native/android/notifications/IncomingRideView.java', 'native/android/notifications/IncomingRideContent.java']);
});

test('native presentation protects locked details and sends at most one action after successful unlock', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const summaryStart = source.indexOf('  private void updateSummary()');
  const summaryEnd = source.indexOf('\n  @Override public void onWindowFocusChanged', summaryStart);
  const actionStart = source.indexOf('  private void unlockAndSend(');
  const actionEnd = source.indexOf('\n  @Override protected void onDestroy', actionStart);
  assert.ok(summaryStart > 0 && summaryEnd > summaryStart && actionStart > 0 && actionEnd > actionStart);
  const harness = `
class IncomingRideView { boolean visible; long remaining; void showDetails(boolean value) { visible=value; }
  void updateCountdown(long value, long duration) { remaining=value; } }
class Notification {}
class PendingIntent { int sends; void send() throws CanceledException { sends++; } static class CanceledException extends Exception {} }
class Build { static class VERSION { static int SDK_INT = 36; } }
class KeyguardManager {
  boolean locked = true, fails; KeyguardDismissCallback callback;
  boolean isKeyguardLocked() { return locked; }
  void requestDismissKeyguard(Object activity, KeyguardDismissCallback cb) { if (fails) throw new IllegalStateException(); callback = cb; }
  static class KeyguardDismissCallback { public void onDismissSucceeded() {} public void onDismissCancelled() {} public void onDismissError() {} }
}
public class LockScreenCheck {
  static final String KEYGUARD_SERVICE = "keyguard";
  IncomingRideView layout = new IncomingRideView(); KeyguardManager keyguard = new KeyguardManager(); Notification card = new Notification();
  boolean resumed = true; long duration = 30000;
  boolean opening, finished; int presentation; long closesAt = System.currentTimeMillis() + 30000;
  Object getSystemService(String name) { return keyguard; }
  Notification currentNotification() { return card; }
  void finish() { finished = true; }
  ${source.slice(summaryStart, summaryEnd)}
  ${source.slice(actionStart, actionEnd)}
  static void check(boolean ok) { if (!ok) throw new AssertionError(); }
  public static void main(String[] args) {
    LockScreenCheck t = new LockScreenCheck();
    t.updateSummary(); check(!t.layout.visible && t.layout.remaining > 0);
    t.keyguard.locked = false; t.updateSummary(); check(t.layout.visible);
    t.keyguard.locked = true; t.updateSummary(); check(!t.layout.visible);
    t.keyguard.locked = false; t.resumed = false; t.updateSummary(); check(!t.layout.visible);
    t.resumed = true; t.card = null; t.updateSummary(); check(!t.layout.visible); t.card = new Notification();
    t.keyguard.locked = true; PendingIntent action = new PendingIntent();
    t.unlockAndSend(action); t.unlockAndSend(action); check(action.sends == 0 && t.opening);
    t.keyguard.callback.onDismissCancelled(); check(!t.opening && action.sends == 0);
    t.unlockAndSend(action); t.keyguard.callback.onDismissError(); check(!t.opening && action.sends == 0);
    t.keyguard.fails = true; t.unlockAndSend(action); check(!t.opening && action.sends == 0);
    t.keyguard.fails = false; t.unlockAndSend(action); t.keyguard.locked = false; t.keyguard.callback.onDismissSucceeded();
    t.unlockAndSend(action); check(action.sends == 1 && t.finished);
    LockScreenCheck expired = new LockScreenCheck(); expired.closesAt = 0; expired.unlockAndSend(action);
    expired.keyguard.callback.onDismissSucceeded(); check(action.sends == 1 && expired.finished);
    LockScreenCheck gone = new LockScreenCheck(); gone.unlockAndSend(action); gone.card = null;
    gone.keyguard.callback.onDismissSucceeded(); check(action.sends == 1 && gone.finished);
    LockScreenCheck replaced = new LockScreenCheck(); replaced.unlockAndSend(action);
    replaced.presentation++; replaced.opening = true;
    replaced.keyguard.callback.onDismissSucceeded(); check(action.sends == 1 && !replaced.finished);
    replaced.keyguard.callback.onDismissCancelled(); check(replaced.opening);
    replaced.keyguard.callback.onDismissError(); check(replaced.opening);
  }
}`;
  const temp = directory(t), file = path.join(temp, 'LockScreenCheck.java'); fs.writeFileSync(file, harness);
  compile(['-d', temp, file]);
  const result = spawnSync('java', ['-cp', temp, 'LockScreenCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
});
