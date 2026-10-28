const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const source = fs.readFileSync('native/android/notifications/DriverAlertModule.java', 'utf8');
const start = source.indexOf('  @ReactMethod\n  public void canLightUpAlertScreen');
const end = source.indexOf('  private boolean canMigrate', start);
assert.ok(start > 0 && end > start);
const methods = source.slice(start, end).replaceAll('@ReactMethod', '');
function temp(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-displayed-wake-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function compile(args) {
  const result = spawnSync('javac', ['-encoding', 'UTF-8', ...args], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
}

test('actual wake bridge methods compile against Android 36 SDK', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const sdk = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    path.join(os.homedir(), 'AppData/Local/Android/Sdk')].filter(Boolean)
    .map(root => path.join(root, 'platforms/android-36/android.jar')).find(fs.existsSync);
  if (!sdk) return t.skip('Android API 36 SDK required');
  const directory = temp(t), file = path.join(directory, 'WakeBridgeCheck.java');
  // Real Android signatures; only React's context accessor/promise are stand-ins.
  // This does not install an APK or measure lock-screen behavior.
  fs.writeFileSync(file, `
import android.app.*;
import android.content.*;
import android.content.pm.*;
import android.media.*;
import android.os.*;
interface Promise { void resolve(Object value); }
class WakeBridgeCheck {
  Context getReactApplicationContext() { return null; }
  ${methods}
}`);
  compile(['-classpath', sdk, '-d', directory, file]);
});

test('native wake requires a live matching card, preserves settings and holds only a bounded display lock', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const directory = temp(t), file = path.join(directory, 'DisplayedWakeCheck.java');
  // Execute the production methods with Android stand-ins. No second copy of
  // their policy and no inference about physical wake/sound from this harness.
  fs.writeFileSync(file, `
interface Promise { void resolve(Object value); }
class Build {
  static class VERSION { static int SDK_INT = 36; }
  static class VERSION_CODES { static int O = 26, P = 28; }
}
class PackageManager { static int PERMISSION_GRANTED = 0; }
class Bundle extends java.util.HashMap<String,Object> {
  Bundle getBundle(String k){return (Bundle)get(k);} String getString(String k){return (String)get(k);}
}
class Notification { String channel="ring"; Bundle extras; String getChannelId() { return channel; } }
class StatusBarNotification {
  int id = "card".hashCode(); String tag; Notification card = new Notification();
  String getTag() { return tag; } int getId() { return id; } Notification getNotification() { return card; }
}
class NotificationChannelGroup { boolean blocked; boolean isBlocked() { return blocked; } }
class NotificationChannel {
  int importance = 4; Object sound = new Object(); String group;
  int getImportance() { return importance; } Object getSound() { return sound; } String getGroup() { return group; }
}
class NotificationManager {
  static final int IMPORTANCE_HIGH = 4, INTERRUPTION_FILTER_ALL = 1;
  boolean enabled = true; int filter = 1;
  NotificationChannel channel = new NotificationChannel(); NotificationChannelGroup group = new NotificationChannelGroup();
  StatusBarNotification[] cards = { new StatusBarNotification() };
  boolean areNotificationsEnabled() { return enabled; }
  int getCurrentInterruptionFilter() { return filter; }
  NotificationChannel getNotificationChannel(String id) { return channel; }
  NotificationChannelGroup getNotificationChannelGroup(String id) { return group; }
  StatusBarNotification[] getActiveNotifications() { return cards; }
}
class AudioManager {
  static final int RINGER_MODE_NORMAL = 2, STREAM_NOTIFICATION = 5;
  int mode = 2, volume = 5; int getRingerMode() { return mode; } int getStreamVolume(int stream) { return volume; }
}
class PowerManager {
  static final int SCREEN_DIM_WAKE_LOCK = 6, ACQUIRE_CAUSES_WAKEUP = 0x10000000, ON_AFTER_RELEASE = 0x20000000;
  boolean interactive, fails; int flags, creations; WakeLock lock = new WakeLock();
  boolean isInteractive() { return interactive; }
  WakeLock newWakeLock(int f, String tag) { if (fails) throw new SecurityException(); flags = f; creations++; return lock; }
  static class WakeLock {
    boolean counted = true; long duration;
    void setReferenceCounted(boolean value) { counted = value; }
    void acquire(long timeout) { duration = timeout; }
  }
}
class Context {
  static final String NOTIFICATION_SERVICE = "notification", AUDIO_SERVICE = "audio", POWER_SERVICE = "power";
  NotificationManager notifications = new NotificationManager(); AudioManager audio = new AudioManager();
  PowerManager power = new PowerManager(); int permission;
  Object getSystemService(String name) { return name.equals(NOTIFICATION_SERVICE) ? notifications : name.equals(AUDIO_SERVICE) ? audio : power; }
  int checkSelfPermission(String name) { return permission; }
}
public class DisplayedWakeCheck {
  Context context = new Context(); Context getReactApplicationContext() { return context; }
  ${methods.replaceAll('android.service.notification.StatusBarNotification', 'StatusBarNotification').replaceAll('android.os.Bundle', 'Bundle')}
  void check(String id, String channel, double deadline, String expected) {
    int before = context.power.creations;
    wakeDisplayedAlert(id, channel, deadline, value -> {
      if (!expected.equals(value)) throw new AssertionError("expected " + expected + ", got " + value);
    });
    if (!expected.equals("requested") && before != context.power.creations) throw new AssertionError("unexpected wake");
  }
  void check(String expected) { check("card", "ring", System.currentTimeMillis() + 30000, expected); }
  public static void main(String[] args) {
    DisplayedWakeCheck t = new DisplayedWakeCheck();
    t.check("requested");
    if (t.context.power.lock.duration != 1500 || t.context.power.lock.counted || t.context.power.creations != 1 ||
        t.context.power.flags != (PowerManager.SCREEN_DIM_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE)) throw new AssertionError("unbounded or extra lock");
    t.check("card", "ring", Double.NaN, "expired"); t.check("card", "ring", 0, "expired");
    t.context.power.interactive = true; t.check("already-on"); t.context.power.interactive = false;
    t.check("other", "ring", System.currentTimeMillis() + 30000, "not-displayed");
    t.check("card", "other", System.currentTimeMillis() + 30000, "not-displayed");
    Notification n=t.context.notifications.cards[0].card; n.channel="ride-audio-visible-v1";
    t.check("not-displayed");
    Bundle payload=new Bundle(), data=new Bundle(); data.put("rideAudioChannel","ring"); payload.put("data",data);
    n.extras=new Bundle(); n.extras.put("notifee.notification",payload); t.check("requested");
    data.put("rideAudioChannel","other"); t.check("not-displayed");
    n.channel="unrelated"; data.put("rideAudioChannel","ring"); t.check("not-displayed"); n.channel="ring";
    t.context.notifications.cards[0].tag = "other"; t.check("not-displayed"); t.context.notifications.cards[0].tag = null;
    t.context.permission = -1; t.check("permission"); t.context.permission = 0;
    t.context.power.fails = true; t.check("permission"); t.context.power.fails = false;
    t.context.notifications.enabled = false; t.check("settings"); t.context.notifications.enabled = true;
    t.context.audio.mode = 0; t.check("settings"); t.context.audio.mode = 2;
    t.context.audio.volume = 0; t.check("settings"); t.context.audio.volume = 5;
    t.context.notifications.filter = 2; t.check("settings"); t.context.notifications.filter = 1;
    t.context.notifications.channel.importance = 2; t.check("settings"); t.context.notifications.channel.importance = 4;
    t.context.notifications.channel.sound = null; t.check("settings"); t.context.notifications.channel.sound = new Object();
    t.context.notifications.channel.group = "group"; t.context.notifications.group.blocked = true; t.check("settings");
    t.context.notifications.group.blocked = false; t.context.notifications.cards = new StatusBarNotification[0]; t.check("not-displayed");
    t.context.notifications.channel = null; t.check("settings");
  }
}`);
  compile(['-d', directory, file]);
  const result = spawnSync('java', ['-cp', directory, 'DisplayedWakeCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
});
