const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('native payload validation rejects expired, self-directed and malformed alerts before presentation', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const source = fs.readFileSync('native/android/notifications/RideNotificationBundle.java', 'utf8');
  // Execute the actual pure policy; this is a JVM test, not an Android/FCM delivery test.
  const policy = source.slice(source.indexOf('final class RideNotificationBundle'), source.indexOf('  static Bundle action')) + '}';
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-native-ride-payload-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'RidePolicyCheck.java');
  fs.writeFileSync(file, `import java.util.*; import java.util.regex.*; import java.text.*;
class DriverAlertModule { static final String BUNDLED_CHANNEL="bundled", PHONE_CHANNEL="phone", LEGACY_CHANNEL="legacy"; }
${policy}
public class RidePolicyCheck {
  static Map<String,String> data = new HashMap<>();
  static final long now = 1793000000000L;
  static String iso(long value) { SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSX", Locale.US);
    f.setTimeZone(TimeZone.getTimeZone("UTC")); return f.format(new Date(value)); }
  static void check(boolean expected) { if (RideNotificationBundle.valid(data, now) != expected) throw new AssertionError(data); }
  public static void main(String[] args) {
    data.put("type", "new_booking"); data.put("driverId", "00000000-0000-4000-8000-000000000001");
    data.put("bookingId", "00000000-0000-4000-8000-000000000002"); data.put("notificationId", "00000000-0000-4000-8000-000000000003");
    data.put("ringUntil", iso(now+60000)); check(true);
    data.put("passengerId", data.get("driverId")); check(false); data.remove("passengerId");
    data.put("ringUntil", iso(now)); check(true);
    data.put("ringUntil", iso(now-300001)); check(false); data.put("ringUntil", "invalid"); check(false);
    data.put("ringUntil", iso(now+1000)); data.put("type", "driver_dispatch_offer"); check(false);
    data.put("offerId", data.get("bookingId")); data.put("expiresAt", iso(now-1)); check(false);
    data.put("expiresAt", iso(now+500)); check(true);
    data.put("notificationId", "../../other"); check(false);
    if (RideNotificationBundle.date("2026-13-01T00:00:00.000Z") != 0) throw new AssertionError("invalid month");
  }
}`);
  const compile = spawnSync('javac', ['-encoding', 'UTF-8', '-d', directory, file], { encoding: 'utf8', timeout: 30000 });
  assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync('java', ['-cp', directory, 'RidePolicyCheck'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, run.stderr);
});
