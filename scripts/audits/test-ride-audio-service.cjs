/* Local emulator, production Java + synthetic fixtures; no FCM/backend/network. */
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
const pkg = 'com.zwanga.audit', output = process.env.RIDE_AUDIT_OUTPUT || '.expo/ride-audio-service-20261028';
const audioOnly = process.env.RIDE_AUDIT_AUDIO_ONLY === '1';
const user = '00000000-0000-4000-8000-000000000001', results = [];
const receive = (...args) => shell('am', 'broadcast', '-n', `${pkg}/.AuditReceiver`, ...args);
const operation = name => receive('--es', 'operation', name);
const record = name => { results.push(name); process.stdout.write(name + '\n'); };
async function probe(payload, mode = 'observe') {
  shell('run-as', pkg, 'rm', '-f', 'files/ride-audit-result.json');
  receive('--es', 'operation', 'native-payload', '--es', 'payload', Buffer.from(JSON.stringify(payload)).toString('base64'), '--es', 'mode', mode);
  for (let i = 0; i < 30; i++) {
    try { const value = JSON.parse(shell('run-as', pkg, 'cat', 'files/ride-audit-result.json')); if (value.notificationId === payload.notificationId) return value; } catch {}
    await sleep(150);
  }
  throw Error('Native probe timed out');
}
async function start(seconds = 55, mode = 'deliver') {
  operation('clear'); await sleep(700);
  shell('input', 'keyevent', 'KEYCODE_WAKEUP'); shell('wm', 'dismiss-keyguard');
  shell('am', 'start', '-n', `${pkg}/.AuditActivity`, '--ez', 'audioTest', 'true'); await sleep(500);
  const now = Number(shell('date', '+%s%3N').trim());
  const payload = { driverId: user, passengerId: '00000000-0000-4000-8000-000000000002',
    notificationId: randomUUID(), bookingId: randomUUID(), type: 'new_booking', actionProtocol: 'driver-v1', nativeAlert: 'driver-v6',
    ringUntil: new Date(now + 60000).toISOString(), alertExpiresAt: new Date(now + seconds * 1000).toISOString(),
    rideArrival: 'DESTINATION TEST LOCAL', ridePricePerSeat: '2500', ridePriceKind: 'fare' };
  const initial = await probe(payload, mode);
  if (mode === 'late-deliver') assert.equal(initial.completed, false, 'publication exceeds the synchronous 2s budget');
  let state;
  for (let i = 0; i < 15; i++) {
    await sleep(400); state = await probe(payload);
    if (state.audioService === 'playing') break;
  }
  assert.equal(state.audioService, 'playing', JSON.stringify(state));
  assert.equal(state.channel, 'ride-audio-visible-v1'); assert.equal(state.ongoing, true);
  return payload;
}
(async () => {
  if (shell('getprop', 'ro.kernel.qemu').trim() !== '1') throw Error('Emulator required');
  fs.mkdirSync(output, { recursive: true });
  try {
    shell('pm', 'grant', pkg, 'android.permission.POST_NOTIFICATIONS');
    receive('--es', 'operation', 'consent', '--ez', 'enabled', 'true');
    shell('appops', 'set', pkg, 'USE_FULL_SCREEN_INTENT', 'allow');
    const late = await start(55, 'late-deliver');
    const beforeReplay = await probe(late);
    await probe(late, 'deliver');
    const afterReplay = await probe(late);
    assert.equal(afterReplay.soundUntil, beforeReplay.soundUntil); assert.equal(afterReplay.count, 1);
    assert.equal(afterReplay.audioService, 'playing');
    record('late_notifee_publication_starts_audio_without_duplicate_or_extended_deadline');
    const first = await start();
    shell('input', 'keyevent', 'KEYCODE_HOME'); await sleep(8000);
    assert.equal((await probe(first)).audioService, 'playing');
    if (!audioOnly) {
      const system = shell('dumpsys', 'activity', 'service', 'com.android.systemui/.SystemUIService');
      fs.writeFileSync(path.join(output, 'systemui-after-8s.txt'), system);
      assert.match(system, /isHeadsUpState\(\)=true/);
    }
    record(audioOnly ? 'service_background_audio_after_8_seconds_banner_not_measured' : 'service_background_audio_and_banner_after_8_seconds');
    operation('other-notification'); await sleep(5000);
    const afterNotification = await probe(first);
    assert.equal(afterNotification.audioService, 'playing'); assert.equal(afterNotification.count, 1);
    record('ordinary_audible_notification_does_not_stop_service_player');
    for (const kind of ['transient', 'duck']) {
      receive('--es', 'operation', 'audio-focus', '--es', 'kind', kind); await sleep(700);
      const during = await probe(first);
      assert.equal(during.audioService, kind === 'transient' ? 'interrupted' : 'playing');
      receive('--es', 'operation', 'audio-focus', '--es', 'kind', 'release'); await sleep(700);
      assert.equal((await probe(first)).audioService, 'playing');
      record(`${kind}_focus_recovers_without_new_alert`);
    }
    receive('--es', 'operation', 'audio-focus', '--es', 'kind', 'permanent'); await sleep(900);
    const lost = await probe(first); assert.equal(lost.audioService, 'stopped');
    assert.equal(lost.count, 1); assert.equal(lost.ongoing, false); assert.equal(lost.fullScreenIntent, false);
    receive('--es', 'operation', 'audio-focus', '--es', 'kind', 'release');
    record('permanent_focus_loss_stops_without_removing_pending_card');
    const sleeping = await start();
    shell('input', 'keyevent', 'KEYCODE_HOME'); shell('input', 'keyevent', 'KEYCODE_SLEEP'); await sleep(1500);
    assert.equal((await probe(sleeping)).audioService, 'playing');
    shell('input', 'keyevent', 'KEYCODE_WAKEUP'); shell('wm', 'dismiss-keyguard'); shell('input', 'keyevent', 'KEYCODE_HOME'); await sleep(900);
    const unlocked = await probe(sleeping); assert.equal(unlocked.audioService, 'playing'); assert.equal(unlocked.count, 1);
    record('existing_service_survives_screen_sleep_and_unlock_outside_app');
    const entry = await start();
    shell('input', 'keyevent', 'KEYCODE_HOME'); await sleep(500);
    shell('am', 'start', '-n', `${pkg}/.AuditActivity`, '--ez', 'audioTest', 'false'); await sleep(1000);
    const inside = await probe(entry); assert.equal(inside.audioService, 'playing'); assert.equal(inside.fullScreenIntent, false);
    operation('handoff'); await sleep(1000);
    assert.equal((await probe(entry)).audioService, 'stopped');
    record('entry_demotes_banner_then_foreground_player_takes_over');
    const cancelled = await start(); operation('clear'); await sleep(1000);
    const removed = await probe(cancelled); assert.equal(removed.audioService, 'stopped'); assert.equal(removed.count, 0);
    record('decision_removal_stops_service_without_reviving_card');
    const expires = await start(8); shell('input', 'keyevent', 'KEYCODE_HOME'); await sleep(8500);
    const ended = await probe(expires); assert.equal(ended.audioService, 'stopped'); assert.equal(ended.fullScreenIntent, false);
    assert.equal(ended.ongoing, false); assert.equal(ended.count, 1);
    record('business_deadline_stops_audio_and_foreground_service');
  } finally {
    receive('--es', 'operation', 'audio-focus', '--es', 'kind', 'release'); operation('clear');
    receive('--es', 'operation', 'consent', '--ez', 'enabled', 'false'); shell('appops', 'set', pkg, 'USE_FULL_SCREEN_INTENT', 'default');
    shell('input', 'keyevent', 'KEYCODE_WAKEUP'); shell('wm', 'dismiss-keyguard'); shell('input', 'keyevent', 'KEYCODE_HOME');
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2) + '\n');
    fs.writeFileSync(path.join(output, 'audio-log.txt'), shell('logcat', '-d', '-s', 'ZwangaRideAudio:I', 'ZwangaAudit:I', 'AndroidRuntime:E'));
  }
})().catch(error => { process.stderr.write(String(error.stack) + '\n'); process.exitCode = 1; });
