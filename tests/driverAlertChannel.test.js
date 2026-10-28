const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture(platform, ensureChannel, settingsFail = false) {
  const calls = [];
  const native = { Platform: { OS: platform }, NativeModules: ensureChannel ? { ZwangaDriverAlerts: { ensureBundledChannel: ensureChannel } } : {},
    Linking: { openSettings: async () => calls.push('app-settings') } };
  const loaded = loader({ 'react-native': native, '@notifee/react-native': { __esModule: true, default: {
    openNotificationSettings: async id => { if (settingsFail) throw Error('unavailable'); calls.push(id); },
  } } })('services/driverAlertChannel.ts');
  return { ...loaded, calls, native };
}

test('only a verified native bundled channel or preserved user channel can enable v3; old binaries keep v2', async () => {
  for (const platform of ['android', 'ios', 'web']) {
    for (const result of ['zwanga-ride-ring-v4', 'driver-phone-ring-v3', 'booking-ring-v2', 'invalid', undefined]) {
      const f = fixture(platform, async () => result);
      assert.equal(await f.getDriverAlertChannel(), platform === 'android' && ['zwanga-ride-ring-v4', 'driver-phone-ring-v3'].includes(result)
        ? result : 'booking-ring-v2');
    }
  }
  assert.equal(await fixture('android').getDriverAlertChannel(), 'booking-ring-v2');
  assert.equal(await fixture('android', async () => { throw Error('native unavailable'); }).getDriverAlertChannel(), 'booking-ring-v2');
  const unavailable = fixture('android');
  Object.defineProperty(unavailable.native.NativeModules, 'ZwangaDriverAlerts', { get() { throw Error('bridge not loaded'); } });
  assert.equal(await unavailable.getDriverAlertChannel(), 'booking-ring-v2');
});

test('a stuck native bridge cannot indefinitely block notification registration', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const result = fixture('android', () => new Promise(() => {})).getDriverAlertChannel();
  t.mock.timers.tick(5000);
  assert.equal(await result, 'booking-ring-v2');
});

test('settings opens the actual OS channel or app permissions, including native fallback', async () => {
  for (const platform of ['android', 'ios']) for (const settingsFail of [false, true]) {
    const f = fixture(platform, async () => 'driver-phone-ring-v3', settingsFail);
    await f.openDriverAlertSettings();
    assert.deepEqual(f.calls, [platform === 'android' && !settingsFail ? 'driver-phone-ring-v3' : 'app-settings']);
  }
});

test('disabled app notifications open the app notification page, not just its ringtone channel', async () => {
  const f = fixture('android', () => { throw Error('must not query channel'); });
  await f.openDriverAlertSettings({ application: true });
  assert.deepEqual(f.calls, [undefined]);
  const fallback = fixture('android', undefined, true);
  await fallback.openDriverAlertSettings({ application: true });
  assert.deepEqual(fallback.calls, ['app-settings']);
});

test('stale settings requests do not open a page before or after asynchronous inspection', async () => {
  const f = fixture('android');
  await f.openDriverAlertSettings({ application: true, current: () => false });
  assert.deepEqual(f.calls, []);
  let current = true;
  const interrupted = fixture('android', async () => { current = false; return 'driver-phone-ring-v3'; });
  await interrupted.openDriverAlertSettings({ current: () => current });
  assert.deepEqual(interrupted.calls, []);
});

test('native channel uses bundled notification audio, preserves user choices and never forces global volume', () => {
  const source = fs.readFileSync('android/app/src/main/java/com/zwanga/notifications/DriverAlertModule.java', 'utf8');
  assert.match(source, /channel.setSound\(Uri.parse\("android.resource:\/\/".*\/raw\/driver_ring/);
  assert.match(source, /setUsage\(AudioAttributes.USAGE_NOTIFICATION\)/);
  assert.match(source, /enableVibration\(true\)/);
  assert.match(source, /setBypassDnd\(false\)/);
  for (const protection of ['hasUserSetSound()', 'hasUserSetImportance()', 'group.isBlocked()', 'channel.getSound() == null', '!channel.shouldVibrate()'])
    assert.ok(source.includes(protection), protection);
  assert.doesNotMatch(source, /deleteNotificationChannel|setStreamVolume|adjustStreamVolume|MediaPlayer|startForegroundService|FLAG_AUDIBILITY_ENFORCED/);
  assert.match(fs.readFileSync('android/app/src/main/java/com/zwanga/MainApplication.kt', 'utf8'), /add\(com\.zwanga\.notifications\.DriverAlertPackage\(\)\)/);
});
