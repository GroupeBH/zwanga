/* Local emulator audit only. Does NOT test FCM, authentication or the React router. */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const serial = process.argv[2] || 'emulator-5554';
const pkg = 'com.zwanga.audit';
const withLock = process.argv.includes('--with-lock');
const output = process.env.RIDE_AUDIT_OUTPUT ? path.resolve(process.env.RIDE_AUDIT_OUTPUT)
  : path.resolve('.expo/ride-alert-emulator-results', process.argv.includes('--fixed') ? 'fixed' : '.', withLock ? 'with-lock' : '.');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function adb(...args) {
  const result = spawnSync('adb', ['-s', serial, ...args], { encoding: 'utf8', timeout: 20000, windowsHide: true });
  if (result.status !== 0) throw new Error(`adb ${args.slice(0, 3).join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
}
const shell = (...args) => adb('shell', ...args);
function inject(operation, ...args) { return shell('am', 'broadcast', '-n', `${pkg}/.AuditReceiver`, '--es', 'operation', operation, ...args); }
function logs(since) {
  return adb('logcat', '-d', '-v', 'epoch', '-s', 'ZwangaAudit:I', '*:S').split('\n')
    .filter(line => Number.parseFloat(line) >= since).join('\n');
}
function currentActivity() {
  return shell('dumpsys', 'activity', 'activities').split('\n').filter(line => /topResumedActivity|mResumedActivity/.test(line)).join('\n');
}
async function snapshot() {
  inject('snapshot'); await pause(250);
  return { activity: currentActivity(),
    wakefulness: shell('dumpsys', 'power').split('\n').filter(line => /mWakefulness=/.test(line)).join('\n') };
}
async function screenshot(name) {
  const result = spawnSync('adb', ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 15000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
  if (result.status === 0) fs.writeFileSync(path.join(output, `${name}.png`), result.stdout);
}
async function awake() {
  shell('input', 'keyevent', '224'); shell('wm', 'dismiss-keyguard'); await pause(300);
}
async function prepare(mode, consent) {
  await awake();
  inject('clear');
  inject('consent', '--ez', 'enabled', String(consent));
  shell('am', 'start', '-W', '-n', `${pkg}/.AuditActivity`); await pause(500);
  if (!currentActivity().includes('com.zwanga.audit/.AuditActivity')) throw new Error('Audit activity did not start; inspect only the harness crash logs before running scenarios');
  if (mode !== 'foreground') { shell('input', 'keyevent', '3'); await pause(400); }
  if (mode === 'asleep') { shell('input', 'keyevent', '223'); await pause(600); }
}
function testNotificationTarget(xml, label) {
  const stack = [], rows = [];
  for (const token of xml.matchAll(/<node\s[^>]*>|<\/node>/g)) {
    if (token[0] === '</node>') {
      const opening = stack.pop();
      if (opening?.[0].includes('resource-id="com.android.systemui:id/expandableNotificationRow"'))
        rows.push(xml.slice(opening.index, token.index + token[0].length));
    } else if (!token[0].endsWith('/>')) stack.push(token);
  }
  const row = rows.find(item => item.includes('[TEST]') && item.includes('Départ TEST → Destination TEST'));
  if (!row) throw new Error('Local test card not visible; refusing blind interaction');
  const node = (row.match(/<node\s[^>]+>/g) || []).find(item => item.includes(`text="${label}"`));
  const bounds = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!bounds) throw new Error(`Test notification action not visible: ${label}`);
  return [Math.round((Number(bounds[1]) + Number(bounds[3])) / 2), Math.round((Number(bounds[2]) + Number(bounds[4])) / 2)];
}
function notificationTarget(label) {
  shell('uiautomator', 'dump', '/sdcard/zwanga-audit-ui.xml');
  return testNotificationTarget(shell('cat', '/sdcard/zwanga-audit-ui.xml'), label);
}
async function run() {
  if (!serial.startsWith('emulator-') || shell('getprop', 'ro.kernel.qemu') !== '1') throw new Error('Emulator required; physical devices are not modified');
  if (!shell('pm', 'list', 'packages', pkg).split('\n').includes(`package:${pkg}`)) throw new Error('Install the separate audit APK first');
  fs.mkdirSync(output, { recursive: true });
  shell('pm', 'grant', pkg, 'android.permission.POST_NOTIFICATIONS');
  shell('cmd', 'appops', 'set', pkg, 'USE_FULL_SCREEN_INTENT', 'allow');
  const results = [];
  const previousLockDisabled = shell('locksettings', 'get-disabled');
  try {
    if (withLock) shell('locksettings', 'set-disabled', 'false');
    for (const kind of ['nearby', 'booking']) for (const mode of ['foreground', 'outside', 'asleep']) {
      for (const consent of mode === 'asleep' ? [false, true] : [false]) {
        const name = `${kind}-${mode}-${consent ? 'fullscreen' : 'notification'}`;
        await prepare(mode, consent);
        const since = Number(shell('date', '+%s.%N'));
        inject('deliver', '--es', 'kind', kind);
        await pause(1200);
        const before = await snapshot();
        await screenshot(name);
        const trace = logs(since);
        const checks = {
          displayed: trace.includes('DISPLAY ok'),
          cardPresent: trace.includes('cards=1'),
          foregroundNativePlayer: mode === 'foreground' ? trace.includes('PLAYER playing') : null,
          outsideDoesNotStealFocus: mode === 'outside' ? !before.activity.includes(pkg) : null,
          wakesScreen: mode === 'asleep' ? before.wakefulness.includes('Awake') : null,
          fullscreen: consent ? before.activity.includes('IncomingRideActivity') : null,
        };
        // Opening by the launcher exercises the native adapter, not React routing.
        await awake(); shell('am', 'start', '-W', '-n', `${pkg}/.AuditActivity`); await pause(1000);
        const resumed = await snapshot();
        const resumeTrace = logs(since);
        checks.resumesNativePlayer = resumeTrace.includes('PLAYER_STARTED true') && resumeTrace.includes('PLAYER playing');
        inject('clear'); await pause(250); await snapshot();
        const finalTrace = logs(since);
        checks.localDecisionStopsPlayer = /PLAYER stopped/.test(finalTrace.slice(finalTrace.lastIndexOf('LOCAL_DECISION_CLEARED')));
        checks.localDecisionRemovesCard = /cards=0/.test(finalTrace.slice(finalTrace.lastIndexOf('LOCAL_DECISION_CLEARED')));
        const record = { name, checks, before, resumed, trace: finalTrace };
        results.push(record);
        fs.writeFileSync(path.join(output, `${name}.log`), finalTrace);
        console.log(JSON.stringify({ name, checks }));
      }
    }
    // Permission refusal: native player must also respect Android permission.
    await prepare('foreground', false);
    shell('pm', 'revoke', pkg, 'android.permission.POST_NOTIFICATIONS');
    shell('am', 'start', '-W', '-n', `${pkg}/.AuditActivity`); await pause(500);
    const since = Number(shell('date', '+%s.%N'));
    inject('deliver', '--es', 'kind', 'nearby'); await pause(1000); await snapshot();
    const trace = logs(since);
    const checks = { noCard: trace.includes('cards=0'), noForegroundSound: trace.includes('PLAYER stopped') && !trace.includes('PLAYER_STARTED true') };
    results.push({ name: 'notifications-denied', checks, trace }); console.log(JSON.stringify({ name: 'notifications-denied', checks }));
    shell('pm', 'grant', pkg, 'android.permission.POST_NOTIFICATIONS');
    for (const kind of ['nearby', 'booking']) for (const action of ['card', 'Refuser', 'Accepter']) {
      await prepare('outside', false);
      const since = Number(shell('date', '+%s.%N'));
      inject('deliver', '--es', 'kind', kind); await pause(600);
      shell('cmd', 'statusbar', 'expand-notifications'); await pause(500);
      const title = kind === 'booking' ? 'Zwanga · Nouvelle réservation [TEST]' : 'Zwanga · Demande près de vous [TEST]';
      const point = notificationTarget(action === 'card' ? title : action);
      shell('input', 'tap', ...point.map(String)); await pause(1200);
      const after = await snapshot(), trace = logs(since);
      const checks = {
        localDetailOpened: after.activity.includes('com.zwanga.audit/.AuditActivity'),
        notifeePressEvent: trace.includes(`EVENT type=${action === 'card' ? 1 : 2}`),
        nativeSoundAfterOpen: trace.includes('PLAYER_STARTED true') && trace.includes('PLAYER playing'),
        cardRetained: trace.includes('cards=1'),
      };
      const name = `${kind}-touch-${action}`;
      results.push({ name, checks, after, trace });
      fs.writeFileSync(path.join(output, `${name}.log`), trace);
      await screenshot(name); console.log(JSON.stringify({ name, checks }));
      inject('clear');
    }
    if (withLock && process.argv.includes('--fixed')) {
      for (const kind of ['nearby', 'booking']) for (const action of ['Refuser', 'Accepter', 'Ouvrir dans Zwanga']) {
        await prepare('asleep', true);
        const since = Number(shell('date', '+%s.%N'));
        inject('deliver', '--es', 'kind', kind); await pause(750);
        if (!currentActivity().includes(`${pkg}/com.zwanga.notifications.IncomingRideActivity`))
          throw new Error('Native fullscreen activity not visible; refusing blind interaction');
        shell('uiautomator', 'dump', '/sdcard/zwanga-audit-ui.xml');
        const xml = shell('cat', '/sdcard/zwanga-audit-ui.xml');
        const node = (xml.match(/<node\s[^>]+>/g) || []).find(item => item.includes(`text="${action}"`) && item.includes(`package="${pkg}"`));
        const b = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
        if (!b) throw new Error(`Native fullscreen button absent: ${action}`);
        shell('input', 'tap', String(Math.round((+b[1] + +b[3]) / 2)), String(Math.round((+b[2] + +b[4]) / 2)));
        await pause(1400);
        const after = await snapshot(), trace = logs(since);
        const checks = {
          localDetailOpened: after.activity.includes(`${pkg}/.AuditActivity`),
          notifeePressEvent: trace.includes(`EVENT type=${action === 'Ouvrir dans Zwanga' ? 1 : 2}`),
          nativeSoundAfterOpen: trace.includes('PLAYER_STARTED true') && trace.includes('PLAYER playing'),
          unlocked: trace.includes('locked=false'),
        };
        const name = `${kind}-fullscreen-${action.replaceAll(' ', '-')}`;
        results.push({ name, checks, after, trace });
        fs.writeFileSync(path.join(output, `${name}.log`), trace);
        console.log(JSON.stringify({ name, checks })); inject('clear');
      }
    }
  } finally {
    shell('pm', 'grant', pkg, 'android.permission.POST_NOTIFICATIONS');
    inject('consent', '--ez', 'enabled', 'false');
    shell('cmd', 'appops', 'set', pkg, 'USE_FULL_SCREEN_INTENT', 'default');
    inject('clear'); await awake(); shell('input', 'keyevent', '3');
    if (withLock) shell('locksettings', 'set-disabled', previousLockDisabled);
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify({ serial, android: shell('getprop', 'ro.build.version.release'),
      scope: 'Native Android + real Notifee core; RN bridge/lifecycle and JS handoff are test adapters, no server', results }, null, 2));
  }
  const failures = results.flatMap(result => Object.entries(result.checks).filter(([, ok]) => ok === false).map(([check]) => `${result.name}:${check}`));
  console.log(JSON.stringify({ cases: results.length, failures, output }));
  process.exitCode = failures.length ? 1 : 0;
}
if (require.main === module) run().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { testNotificationTarget };
