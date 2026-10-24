const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('native fullscreen eligibility accepts screen-off without keyguard but preserves consent and Android grants', t => {
  if (spawnSync('javac', ['-version'], { encoding: 'utf8' }).status !== 0) return t.skip('JDK required');
  const source = fs.readFileSync('native/android/notifications/DriverAlertModule.java', 'utf8');
  const start = source.indexOf('  @ReactMethod public void canPresentFullScreen(');
  const end = source.indexOf('\n  @ReactMethod', start + 1);
  assert.ok(start > 0 && end > start);
  const method = source.slice(start, end).replace('@ReactMethod ', '');
  // Execute the production method with system stand-ins, not a second copy
  // of its boolean policy. This is NOT an Android device or notification test.
  const harness = `
interface Promise { void resolve(Object value); }
class Build { static class VERSION { static int SDK_INT = 34; } }
class PackageManager { static int PERMISSION_GRANTED = 0; }
class NotificationManager {
  boolean enabled = true, fullScreen = true;
  boolean areNotificationsEnabled() { return enabled; }
  boolean canUseFullScreenIntent() { return fullScreen; }
}
class KeyguardManager { boolean locked; boolean isKeyguardLocked() { return locked; } }
class PowerManager { boolean interactive = true; boolean isInteractive() { return interactive; } }
class Preferences { boolean optIn = true; boolean getBoolean(String key, boolean fallback) { return optIn; } }
class Context {
  static final int MODE_PRIVATE = 0;
  static final String NOTIFICATION_SERVICE = "notification", KEYGUARD_SERVICE = "keyguard", POWER_SERVICE = "power";
  NotificationManager manager = new NotificationManager(); KeyguardManager keyguard = new KeyguardManager();
  PowerManager power = new PowerManager(); Preferences preferences = new Preferences(); int permission;
  Object getSystemService(String service) { return service.equals(NOTIFICATION_SERVICE) ? manager : service.equals(KEYGUARD_SERVICE) ? keyguard : power; }
  Preferences getSharedPreferences(String name, int mode) { return preferences; }
  int checkSelfPermission(String name) { return permission; }
}
public class WakeEligibilityCheck {
  Context context = new Context(); boolean enabled = true;
  Context getReactApplicationContext() { return context; }
  boolean fullScreenBuildEnabled(Context ignored) { return enabled; }
  ${method}
  void check(boolean expected) { canPresentFullScreen("driver", result -> {
    if (!Boolean.valueOf(expected).equals(result)) throw new AssertionError("expected " + expected + ", got " + result);
  }); }
  public static void main(String[] args) {
    WakeEligibilityCheck t = new WakeEligibilityCheck();
    t.check(false); // unlocked, screen on: never steal the foreground
    t.context.power.interactive = false; t.check(true); // screen off, before automatic lock or without PIN
    t.context.power.interactive = true; t.context.keyguard.locked = true; t.check(true);
    t.context.preferences.optIn = false; t.check(false); t.context.preferences.optIn = true;
    t.context.manager.fullScreen = false; t.check(false); t.context.manager.fullScreen = true;
    t.context.manager.enabled = false; t.check(false); t.context.manager.enabled = true;
    t.context.permission = -1; t.check(false); t.context.permission = 0;
    t.enabled = false; t.check(false); t.enabled = true;
    t.context.keyguard = null; t.context.power.interactive = false; t.check(true);
    t.context.power = null; t.check(false); // unavailable system services fail closed
    t.context.manager = null; t.check(false);
  }
}`;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-wake-policy-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'WakeEligibilityCheck.java');
  fs.writeFileSync(file, harness);
  const compile = spawnSync('javac', [file], { encoding: 'utf8', timeout: 30000 });
  assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync('java', ['-cp', directory, 'WakeEligibilityCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stderr);
});
