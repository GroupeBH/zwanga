/* global __dirname */
/* Read-only cross-repository contract check. No network, credentials or native app startup. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
if (!args.includes('--backend') || !args.includes('--mobile-ref'))
  throw new Error('Usage: node scripts/check-backend-mobile-ringing.cjs --backend <path> --mobile-ref <commit>');
const backend = path.resolve(option('--backend'));
const ref = option('--mobile-ref');
if (!/^[a-f0-9]{7,40}$/i.test(ref)) throw new Error('Use an explicit mobile commit hash.');
const mobile = path.resolve(__dirname, '..');
const git = (...parameters) => execFileSync('git', ['-C', mobile, ...parameters], { encoding: 'utf8', windowsHide: true });
const commit = git('rev-parse', '--verify', `${ref}^{commit}`).trim();
const allowedMobile = new Set(['driverInvitation', 'ridePlaybackDeadline', 'rideSound', 'rideAlert',
  'requestOwnership', 'driverNotificationCard'].map(name => `features/notifications/${name}.ts`));
allowedMobile.add('services/rideAlertSession.ts');
const allowedBackend = new Set(['native-android-driver-push', 'android-driver-backup', 'ios-driver-push', 'ride-card-content']
  .map(name => `src/notifications/${name}.ts`));
function loader(root, allowed, read) {
  const cache = new Map();
  function load(file) {
    if (!allowed.has(file)) throw new Error(`Module outside contract scope: ${file}`);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const localRequire = name => {
      if (file === 'services/rideAlertSession.ts' && name === './tokenSession') return { getTokenSessionVersion: () => 1 };
      if (!(name.startsWith('.') || name.startsWith('@/'))) throw new Error(`Unexpected runtime dependency: ${name}`);
      const target = (name.startsWith('@/') ? name.slice(2) : path.posix.join(path.posix.dirname(file), name)) + '.ts';
      return load(target);
    };
    const output = ts.transpileModule(read(file), { fileName: path.join(root, file),
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}
const client = loader(mobile, allowedMobile, file => git('show', `${commit}:${file}`));
const server = loader(backend, allowedBackend, file => fs.readFileSync(path.join(backend, file), 'utf8'));
const { nativeAndroidDriverPush } = server('src/notifications/native-android-driver-push.ts');
const { iosDriverPush } = server('src/notifications/ios-driver-push.ts');
const { parseDriverInvitation, readDriverPushData, invitationHref } = client('features/notifications/driverInvitation.ts');
const { parseNearbyPhoneAlert } = client('features/notifications/rideSound.ts');
const { parseRideAlert } = client('features/notifications/rideAlert.ts');
const { driverNotificationActions } = client('features/notifications/driverNotificationCard.ts');
const session = client('services/rideAlertSession.ts');
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const now = Date.now(), until = new Date(now + 40_000).toISOString();
const kinds = { new_booking: 'booking', driver_dispatch_offer: 'dispatch', trip_request_nearby: 'nearby' };
let count = 0;
function check(label, action) { action(); count++; process.stdout.write(`OK ${label}\n`); }
for (const [type, kind] of Object.entries(kinds)) {
  const n = { id: uuid(1), userId: uuid(2), createdAt: new Date(now), title: 'Zwanga', body: 'Trajet de test',
    data: { type, driverId: uuid(2), passengerId: uuid(3), tripRequestId: uuid(4),
      ...(kind === 'booking' ? { bookingId: uuid(5) } : { offerId: uuid(6), expiresAt: until, alertExpiresAt: until }),
      ringAlert: 'nearby-request-v1', rideArrival: 'Destination de test', ridePricePerSeat: '2500', ridePriceKind: 'budget' } };
  const android = nativeAndroidDriverPush(n, 'synthetic-token', until);
  const ios = iosDriverPush(n, 'synthetic-token', until);
  for (const [transport, data] of [['native-android', android.data], ['expo-backup', JSON.parse(android.data.body)],
    ['ios-fcm', ios.data], ['ios-expo-wrapper', readDriverPushData({ data: { dataString: JSON.stringify(ios.apns.payload.body) } })]]) {
    check(`${type}/${transport}`, () => {
      const parsed = parseDriverInvitation(data) ?? parseNearbyPhoneAlert(data);
      assert.equal(parsed?.kind, kind);
      assert.equal(parsed.driverId, uuid(2));
      assert.equal(parsed.id, kind === 'booking' ? uuid(5) : kind === 'dispatch' ? uuid(6) : uuid(4));
      assert.equal(parseRideAlert(data).key, `driver-${kind}-${parsed.id}`);
      assert.equal(invitationHref(parsed).pathname, kind === 'nearby' ? '/request-details/[id]' : '/incoming-driver');
      assert.deepEqual(driverNotificationActions(kind, data).map(button => button.pressAction.id),
        kind === 'nearby' ? ['driver-ignore-nearby', 'driver-review-nearby'] : ['driver-decline', 'driver-accept']);
      assert.equal(parsed.ringUntil, until);
    });
  }
  check(`${type}/author-is-excluded`, () => {
    const self = { ...android.data, passengerId: uuid(2) };
    assert.equal(parseRideAlert(self), null);
  });
  check(`${type}/one-entry-for-duplicate-delivery`, () => {
    session.clearRideAlertSession();
    session.setRideAlertScreen(uuid(2), '/');
    const alert = parseRideAlert(android.data);
    session.rememberRideAlert(alert); session.rememberRideAlert(alert, true);
    assert.equal(session.pendingRideAlerts(uuid(2)).length, 1);
    session.acknowledgeRideAlerts(candidate => candidate.key === alert.key);
    session.rememberRideAlert(alert, true);
    assert.equal(session.pendingRideAlerts(uuid(2)).length, 0);
  });
  if (kind !== 'booking') check(`${type}/expired-invitation-does-not-restart`, () => {
    session.clearRideAlertSession(); session.setRideAlertScreen(uuid(2), '/');
    const expired = new Date(Date.now() - 1).toISOString();
    session.rememberRideAlert(parseRideAlert({ ...android.data, ringUntil: expired, expiresAt: expired, alertExpiresAt: expired }), true);
    assert.equal(session.pendingRideAlerts(uuid(2)).length, 0);
  });
}
process.stdout.write(JSON.stringify({ mobileCommit: commit, passed: count,
  limitation: 'Source contracts only; store build provenance, OS presentation, FCM delivery and audible playback not verified.' }) + '\n');
