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
  compile(['-classpath', sdk, '-d', temp, stub, sourcePath]);
});

test('native presentation protects locked details and sends at most one action after successful unlock', t => {
  if (spawnSync('javac', ['-version']).status !== 0) return t.skip('JDK required');
  const summaryStart = source.indexOf('  private void updateSummary()');
  const summaryEnd = source.indexOf('\n  @Override public void onWindowFocusChanged', summaryStart);
  const actionStart = source.indexOf('  private void unlockAndSend(');
  const actionEnd = source.indexOf('\n  @Override protected void onDestroy', actionStart);
  assert.ok(summaryStart > 0 && summaryEnd > summaryStart && actionStart > 0 && actionEnd > actionStart);
  const harness = `
class TextView { String text; void setText(CharSequence value) { text = value.toString(); } }
class Extras { CharSequence body; CharSequence getCharSequence(String key) { return body; } }
class Notification { static final String EXTRA_BIG_TEXT = "big", EXTRA_TEXT = "text"; Extras extras = new Extras(); }
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
  TextView summary = new TextView(); KeyguardManager keyguard = new KeyguardManager(); Notification card = new Notification();
  boolean opening, finished; int presentation; long closesAt = System.currentTimeMillis() + 30000;
  Object getSystemService(String name) { return keyguard; }
  Notification currentNotification() { return card; }
  void finish() { finished = true; }
  ${source.slice(summaryStart, summaryEnd)}
  ${source.slice(actionStart, actionEnd)}
  static void check(boolean ok) { if (!ok) throw new AssertionError(); }
  public static void main(String[] args) {
    LockScreenCheck t = new LockScreenCheck(); t.card.extras.body = "Départ → Destination · 2000 FC";
    t.updateSummary(); check(t.summary.text.contains("Zwanga") && !t.summary.text.contains("Destination"));
    t.keyguard.locked = false; t.updateSummary(); check(t.summary.text.contains("Destination"));
    t.keyguard.locked = true; t.updateSummary(); check(!t.summary.text.contains("Destination"));
    t.keyguard.locked = false; t.card.extras.body = "x".repeat(2000); t.updateSummary(); check(t.summary.text.length() == 1000);
    t.card.extras.body = null; t.updateSummary(); check(t.summary.text.contains("Ouvrez Zwanga"));
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
