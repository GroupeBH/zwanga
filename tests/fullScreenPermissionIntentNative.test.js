const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('native permission review targets this app, respects lifecycle and never grants OS access', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const source = fs.readFileSync('native/android/notifications/DriverAlertModule.java', 'utf8');
  const start = source.indexOf('  @ReactMethod public void requestFullScreenPermission(');
  const end = source.indexOf('  @ReactMethod public void canPresentFullScreen(', start);
  assert.ok(start > 0 && end > start);
  // Actual production method, only Android type names adapted to JVM stand-ins.
  const method = source.slice(start, end).replace(/@ReactMethod /g, '')
    .replace(/android\.os\.|android\.app\.|com\.facebook\.react\.common\./g, '');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-permission-intent-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const filename = path.join(directory, 'PermissionIntentCheck.java');
  fs.writeFileSync(filename, `
class Build { static class VERSION { static int SDK_INT = 36; } }
class SystemClock { static long now = 100; static long elapsedRealtime() { return now; } }
class Looper { static final Looper main = new Looper(); static Looper getMainLooper() { return main; } }
class Handler {
  static Runnable queued;
  Handler(Looper l) { if (l != Looper.main) throw new AssertionError("Not UI thread"); }
  void post(Runnable r) { queued = r; }
  static void flush() { Runnable r = queued; queued = null; if (r != null) r.run(); }
}
enum LifecycleState { RESUMED, BEFORE_RESUME }
interface Promise { void resolve(Object v); }
class Uri { String value; Uri(String v) { value=v; } static Uri parse(String s) { return new Uri(s); } }
class Settings { static String ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT = "android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT"; }
class Intent { String action; Uri uri; Intent(String a, Uri u) { action=a; uri=u; } }
class Preferences {
  boolean consent;
  Preferences edit() { return this; } Preferences putBoolean(String k, boolean b) { consent=b; return this; }
  void apply() { }
}
class Context {
  static int MODE_PRIVATE = 0;
  LifecycleState lifecycle = LifecycleState.RESUMED;
  Preferences prefs = new Preferences();
  LifecycleState getLifecycleState() { return lifecycle; }
  Preferences getSharedPreferences(String name, int mode) { return prefs; }
  String getPackageName() { return "com.zwanga.audit"; }
}
class Activity {
  boolean finishing, destroyed, fail; Intent opened;
  boolean isFinishing() { return finishing; } boolean isDestroyed() { return destroyed; }
  void startActivity(Intent i) { if (fail) throw new SecurityException(); opened=i; }
}
public class PermissionIntentCheck {
  Context context = new Context(); Activity activity = new Activity(); boolean build = true; Object result;
  Context getReactApplicationContext() { return context; } Activity getCurrentActivity() { return activity; }
  boolean fullScreenBuildEnabled(Context c) { return build; }
  void setFullScreenOptIn(String u, boolean enabled, Promise p) { context.prefs.consent=enabled; p.resolve(true); }
  ${method}
  void request(String user) { requestFullScreenPermission(user, v -> result=v); }
  static void check(boolean condition) { if (!condition) throw new AssertionError(); }
  public static void main(String[] args) {
    PermissionIntentCheck p = new PermissionIntentCheck();
    p.request("driver"); check(p.activity.opened == null); Handler.flush();
    check("settings-opened".equals(p.result) && p.context.prefs.consent);
    check(p.activity.opened.action.equals(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT));
    check(p.activity.opened.uri.value.equals("package:com.zwanga.audit"));
    // Repeated explicit reviews still open the OS page; no canUseFullScreenIntent shortcut.
    p.activity.opened = null; p.request("driver"); Handler.flush(); check(p.activity.opened != null);
    for (int mode=0; mode<8; mode++) {
      p = new PermissionIntentCheck();
      if (mode==0) p.build=false;
      if (mode==1) p.activity=null;
      if (mode==2) p.activity.finishing=true;
      if (mode==3) p.activity.destroyed=true;
      if (mode==4) p.context.lifecycle=LifecycleState.BEFORE_RESUME;
      if (mode==5) p.activity.fail=true;
      p.request(mode==6 ? "" : "driver");
      if (mode==7) SystemClock.now += 1800;
      Handler.flush(); check(Boolean.FALSE.equals(p.result)); check(!p.context.prefs.consent);
      check(p.activity == null || p.activity.opened == null);
    }
    Build.VERSION.SDK_INT=33; p = new PermissionIntentCheck(); p.request("driver"); Handler.flush();
    check(Boolean.TRUE.equals(p.result) && p.activity.opened == null && p.context.prefs.consent);
  }
}
`);
  const compile = spawnSync('javac', ['-encoding', 'UTF-8', filename], { encoding: 'utf8', timeout: 30000 });
  assert.equal(compile.status, 0, compile.stderr);
  const run = spawnSync('java', ['-cp', directory, 'PermissionIntentCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stderr);
});
