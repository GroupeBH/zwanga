/* Real local Android UI; synthetic payload only, no network or user account. */
const { execFileSync } = require('node:child_process');
const { Buffer } = require('node:buffer');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { observeLiveRide } = require('./observe-live-ride.cjs');
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
const deviceNow = () => Number(shell('date', '+%s%3N').trim());
const live = (payload, observe) => observeLiveRide(payload, observe, deviceNow);
async function bannerState(payload, label) {
  return live(payload, () => {
    const id = `driver-booking-${payload.bookingId}`;
    const hash = [...id].reduce((value, char) => (31 * value + char.charCodeAt(0)) | 0, 0);
    const dump = shell('dumpsys', 'activity', 'service', 'com.android.systemui/.SystemUIService');
    const start = dump.indexOf(`Notification: 0|${pkg}|${hash}|`);
    const state = start < 0 ? '' : dump.slice(start).match(/^[\s\S]*?Intrinsic Height Factors:[^\n]+/)?.[0] || '';
    // Select this invitation, never the competing notification or a previous one.
    fs.writeFileSync(path.join(output, `${label}-system-state.txt`), state);
    return state.includes('isHeadsUpState()=true') && state.includes('isPinned()=true');
  });
}
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
    const now = deviceNow();
    const payload = { driverId: user, passengerId: '00000000-0000-4000-8000-000000000002',
      notificationId: randomUUID(), bookingId: randomUUID(), type: 'new_booking', actionProtocol: 'driver-v1', nativeAlert: 'driver-v6',
      ringUntil: new Date(now + 60000).toISOString(), alertExpiresAt: new Date(now + 25000).toISOString(),
      rideArrival: 'DESTINATION TEST LOCAL', ridePricePerSeat: '2500', ridePriceKind: 'fare' };
    const first = await probe(payload); assert.equal(first.fullScreenIntent, true); assert.equal(first.count, 1);
    await sleep(8000);
    const visible = await bannerState(payload, 'banner-after-8-seconds');
    const activities = shell('dumpsys', 'activity', 'activities');
    assert.doesNotMatch(activities, /(?:topResumedActivity|mResumedActivity)[^\n]*IncomingRideActivity/);
    // SystemUI owns this non-focusable row. A launcher UI dump cannot validate it.
    // Keep expensive screenshots outside the time-critical observations.
    assert.equal(visible, true, 'banner is still on top after the normal heads-up timeout');
    record('banner_visible_after_8_seconds_without_opening_app');
    receive('--es', 'operation', 'other-notification');
    await sleep(500);
    assert.equal(await bannerState(payload, 'banner-during-other-notification'), true,
      'ride banner remains pinned while a distinct ordinary notification arrives');
    const interrupted = await live(payload, () => probe(payload, 'observe'));
    assert.equal(interrupted.count, 1); assert.equal(interrupted.fullScreenIntent, true);
    record('banner_pinned_during_competing_local_notification');
    await sleep(4500);
    assert.equal(await bannerState(payload, 'banner-after-other-notification'), true,
      'ride banner remains pinned after the competing notification expires');
    record('banner_pinned_after_competing_local_notification');
    fs.writeFileSync(path.join(output, 'banner-after-live-observations.png'), execFileSync(adb,
      ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 15000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 }));
    // Expiry has its own fresh invitation, independent of diagnostic duration.
    receive('--es', 'operation', 'clear');
    const expiryNow = deviceNow();
    const expiring = { ...payload, notificationId: randomUUID(), bookingId: randomUUID(),
      ringUntil: new Date(expiryNow + 60000).toISOString(), alertExpiresAt: new Date(expiryNow + 5000).toISOString() };
    const beforeExpiry = await live(expiring, () => probe(expiring));
    assert.equal(beforeExpiry.count, 1); assert.equal(beforeExpiry.fullScreenIntent, true);
    await sleep(Math.max(0, expiryNow + 7000 - deviceNow()));
    const finished = await probe(expiring, 'observe');
    assert.equal(finished.count, 1); assert.equal(finished.fullScreenIntent, false); assert.equal(finished.actions, 2);
    record('presentation_expires_but_pending_card_and_actions_remain');
    receive('--es', 'operation', 'clear');
    const nextNow = deviceNow();
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
