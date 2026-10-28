/* Real local Android UI; synthetic payload only, no network or user account. */
const { execFileSync } = require('node:child_process');
const { Buffer } = require('node:buffer');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const serial = process.env.RIDE_AUDIT_SERIAL || 'emulator-5554';
const adb = process.env.RIDE_AUDIT_ADB;
if (!adb || !/^emulator-\d+$/.test(serial)) throw Error('Local emulator and RIDE_AUDIT_ADB required');
const run = (...args) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 15000, windowsHide: true });
const shell = (...args) => run('shell', ...args);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const pkg = 'com.zwanga.audit', output = process.env.RIDE_AUDIT_OUTPUT || '.expo/ride-banner-20261028';
const user = '00000000-0000-4000-8000-000000000001';
const results = [];
const record = name => { results.push(name); process.stdout.write(name + '\n'); };
const receive = (...args) => shell('am', 'broadcast', '-n', `${pkg}/.AuditReceiver`, ...args);
async function probe(payload, mode = 'deliver') {
  shell('run-as', pkg, 'rm', '-f', 'files/ride-audit-result.json');
  receive('--es', 'operation', 'native-payload', '--es', 'payload', Buffer.from(JSON.stringify(payload)).toString('base64'), '--es', 'mode', mode);
  for (let i = 0; i < 30; i++) {
    try { const value = JSON.parse(shell('run-as', pkg, 'cat', 'files/ride-audit-result.json')); if (value.notificationId === payload.notificationId) return value; } catch {}
    await sleep(200);
  }
  throw Error('Local native delivery timed out');
}
(async () => {
  if (shell('getprop', 'ro.kernel.qemu').trim() !== '1') throw Error('Emulator required');
  fs.mkdirSync(output, { recursive: true });
  try {
    shell('input', 'keyevent', 'KEYCODE_WAKEUP'); shell('wm', 'dismiss-keyguard');
    shell('input', 'keyevent', 'KEYCODE_HOME'); shell('cmd', 'statusbar', 'collapse');
    receive('--es', 'operation', 'clear');
    receive('--es', 'operation', 'consent', '--ez', 'enabled', 'true');
    shell('appops', 'set', pkg, 'USE_FULL_SCREEN_INTENT', 'allow');
    const now = Number(shell('date', '+%s%3N').trim());
    const payload = { driverId: user, passengerId: '00000000-0000-4000-8000-000000000002',
      notificationId: randomUUID(), bookingId: randomUUID(), type: 'new_booking', actionProtocol: 'driver-v1', nativeAlert: 'driver-v6',
      ringUntil: new Date(now + 60000).toISOString(), alertExpiresAt: new Date(now + 25000).toISOString(),
      rideArrival: 'DESTINATION TEST LOCAL', ridePricePerSeat: '2500', ridePriceKind: 'fare' };
    const first = await probe(payload); assert.equal(first.fullScreenIntent, true); assert.equal(first.count, 1);
    await sleep(8000);
    fs.writeFileSync(path.join(output, 'banner-after-8-seconds.png'), execFileSync(adb,
      ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 15000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }));
    const systemUI = shell('dumpsys', 'activity', 'service', 'com.android.systemui/.SystemUIService');
    const cardState = systemUI.match(/Notification: 0\|com\.zwanga\.audit\|[^\n]+\n[\s\S]*?Intrinsic Height Factors:[^\n]+/)?.[0] || '';
    fs.writeFileSync(path.join(output, 'banner-system-state.txt'), cardState);
    const activities = shell('dumpsys', 'activity', 'activities');
    assert.doesNotMatch(activities, /(?:topResumedActivity|mResumedActivity)[^\n]*IncomingRideActivity/);
    shell('uiautomator', 'dump', '/sdcard/zwanga-banner-test.xml');
    const xml = shell('cat', '/sdcard/zwanga-banner-test.xml');
    fs.writeFileSync(path.join(output, 'banner-after-8-seconds.xml'), xml);
    // uiautomator's focused root is the launcher, not the non-focusable banner.
    // Check the real SystemUI row and retain a screenshot for visual inspection.
    const visible = cardState.includes('isHeadsUpState()=true') && cardState.includes('isPinned()=true');
    assert.equal(visible, true, 'banner is still on top after the normal heads-up timeout');
    record('banner_visible_after_8_seconds_without_opening_app');
    const remaining = Math.max(0, now + 27000 - Number(shell('date', '+%s%3N').trim()));
    await sleep(remaining);
    const finished = await probe(payload, 'observe');
    assert.equal(finished.count, 1); assert.equal(finished.fullScreenIntent, false); assert.equal(finished.actions, 2);
    record('presentation_expires_but_pending_card_and_actions_remain');
    receive('--es', 'operation', 'clear');
    const nextNow = Number(shell('date', '+%s%3N').trim());
    const dismissed = { ...payload, notificationId: randomUUID(), bookingId: randomUUID(),
      ringUntil: new Date(nextNow + 60000).toISOString(), alertExpiresAt: new Date(nextNow + 5000).toISOString() };
    assert.equal((await probe(dismissed)).count, 1);
    receive('--es', 'operation', 'clear'); await sleep(6500);
    const removed = await probe(dismissed, 'observe'); assert.equal(removed.count, 0);
    record('dismissed_card_is_not_revived');
  } finally {
    receive('--es', 'operation', 'clear'); receive('--es', 'operation', 'consent', '--ez', 'enabled', 'false');
    shell('appops', 'set', pkg, 'USE_FULL_SCREEN_INTENT', 'default');
    shell('input', 'keyevent', 'KEYCODE_WAKEUP'); shell('wm', 'dismiss-keyguard'); shell('input', 'keyevent', 'KEYCODE_HOME');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
  }
})().catch(error => { process.stderr.write(String(error.stack) + '\n'); process.exitCode = 1; });
