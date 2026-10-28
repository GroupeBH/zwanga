const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('actual native channel-readiness method respects low importance, legacy channels and blocked groups', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const source = fs.readFileSync('native/android/notifications/DriverAlertModule.java', 'utf8');
  const start = source.indexOf('  static boolean fullScreenChannelReady(');
  const end = source.indexOf('  @ReactMethod public void setFullScreenOptIn', start);
  assert.ok(start > 0 && end > start);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-fullscreen-channel-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'ChannelReadinessCheck.java');
  // Real production method with Android stand-ins; not a physical-device test.
  fs.writeFileSync(file, `
class Build { static class VERSION { static int SDK_INT = 36; } }
class Context { String channel = "bundled"; }
class NativeRideDelivery {
  static Context current;
  static NativeRideDelivery prefs(Context c) { current = c; return new NativeRideDelivery(); }
  String getString(String key, String fallback) { return current.channel; }
}
class RideNotificationBundle {
  static boolean channel(String id) { return "bundled".equals(id) || "legacy".equals(id) || "phone".equals(id); }
}
class NotificationChannel {
  int importance = 4; String group;
  int getImportance() { return importance; } String getGroup() { return group; }
}
class NotificationChannelGroup { boolean blocked; boolean isBlocked() { return blocked; } }
class NotificationManager {
  static final int IMPORTANCE_HIGH = 4;
  java.util.Map<String,NotificationChannel> channels = new java.util.HashMap<>();
  NotificationChannelGroup group = new NotificationChannelGroup();
  NotificationChannel getNotificationChannel(String id) { return channels.get(id); }
  NotificationChannelGroup getNotificationChannelGroup(String id) { return group; }
}
public class ChannelReadinessCheck {
  static final String BUNDLED_CHANNEL = "bundled", PHONE_CHANNEL = "phone", LEGACY_CHANNEL = "legacy";
  ${source.slice(start, end)}
  static void check(Context c, NotificationManager m, boolean expected) {
    if (fullScreenChannelReady(c, m) != expected) throw new AssertionError("Incorrect readiness");
  }
  public static void main(String[] args) {
    Context c = new Context(); NotificationManager m = new NotificationManager();
    check(c, null, false); check(c, m, false);
    NotificationChannel channel = new NotificationChannel(); m.channels.put("bundled", channel); check(c, m, true);
    for (int importance : new int[]{0, 1, 2, 3}) { channel.importance = importance; check(c, m, false); }
    channel.importance = 4; channel.group = "group"; m.group.blocked = true; check(c, m, false);
    m.group.blocked = false; check(c, m, true);
    m.channels.clear(); m.channels.put("legacy", channel); check(c, m, true);
    channel.importance = 0; check(c, m, false);
    m.channels.put("bundled", new NotificationChannel()); c.channel = "legacy"; check(c, m, false);
    c.channel = "invalid"; check(c, m, true);
    Build.VERSION.SDK_INT = 25; m.channels.clear(); check(c, m, true);
  }
}`);
  const compile = spawnSync('javac', ['-encoding', 'UTF-8', file], { encoding: 'utf8', timeout: 30000 });
  assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync('java', ['-cp', directory, 'ChannelReadinessCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stderr);
});
