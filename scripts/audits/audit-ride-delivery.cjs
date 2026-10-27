/* global __dirname */
// Read-only audit probes. No HTTP, FCM, user account or database access.
// Execute actual methods extracted by TypeScript AST with simulated I/O.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const backend = path.resolve(root, '../zwanga-backend');
const source = fs.readFileSync(path.join(backend, 'src/notifications/notifications.service.ts'), 'utf8');
const ast = ts.createSourceFile('service.ts', source, ts.ScriptTarget.Latest, true);
const service = ast.statements.find(s => ts.isClassDeclaration(s) && s.name.text === 'NotificationService');
const names = ['dispatchUrgentNotifications', 'dispatchNotificationLane', 'driverRingUntil'];
const methods = names.map(name => {
  const method = service.members.find(m => m.name?.getText(ast) === name);
  assert.ok(method, `Method missing: ${name}`);
  const asyncPrefix = method.modifiers?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword) ? 'async ' : '';
  return `${asyncPrefix}${name}${source.slice(method.name.end, method.end)}`;
});
const code = ts.transpileModule(`class Probe { ${methods.join('\n')} }; Probe;`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
let now = 1793000000000;
class AuditDate extends Date {
  constructor(value) { super(value === undefined ? now : value); }
  static now() { return now; }
}
const Probe = vm.runInNewContext(code, {
  Date: AuditDate, Promise, Math,
  Notification: class {}, NotificationStatus: { PENDING: 'pending', FAILED: 'failed' },
  URGENT_NOTIFICATION_TYPES: ['driver_dispatch_offer'], CRITICAL_RETRY_BATCH_SIZE: 25,
  PUSH_CLAIM_LEASE_MS: 20000, PUSH_DELIVERY_TIMEOUT_MS: 10000,
  recoverUnacknowledgedRides: async () => 0,
  randomUUID: () => 'synthetic-claim', ownPushClaim() {}, heartbeatPushClaim: () => () => {},
});

async function serverProbes() {
  const fast = new Probe();
  let batches = 0;
  fast.notificationRepository = { manager: {} }; fast.logger = { warn() {} };
  fast.dispatchRealtimeNotifications = async () => {};
  fast.dispatchNotificationLane = async () => { batches++; return batches <= 10 ? 5 : 0; };
  await fast.dispatchUrgentNotifications();
  console.log(JSON.stringify({ probe: 'fast-broadcast-drain', batches, recipients: Math.min(batches, 10) * 5,
    issueDetected: batches === 1, methodSource: 'notifications.service.ts:dispatchUrgentNotifications' }));

  const slow = new Probe();
  slow.urgentWorkers = 0;
  slow.logger = { warn() {}, error() {} };
  slow.isCriticalNotificationStillDeliverable = async () => true;
  let finish, sends = 0, claims = 0;
  const pending = new Promise(resolve => { finish = resolve; });
  slow.deliverSavedNotification = async () => { sends++; await pending; };
  const query = new Proxy({}, { get(_target, key) {
    if (key === 'getMany') return async () => {
      claims++;
      return Array.from({ length: 5 }, (_, i) => ({ id: `synthetic-${i}`, status: 'pending' }));
    };
    return () => query;
  } });
  slow.notificationRepository = { manager: { transaction: async fn => fn({ getRepository: () => ({
    createQueryBuilder: () => query, save: async rows => rows,
  }) }) } };
  const first = slow.dispatchNotificationLane(true);
  await new Promise(resolve => setImmediate(resolve));
  now += 61000;
  const next = await slow.dispatchNotificationLane(true);
  console.log(JSON.stringify({ probe: 'lane-with-deliberately-unbounded-test-transport', elapsedSimulatedMs: 61000,
    sendsInFlight: sends, nextBatch: next, claims,
    unboundedAdapterSaturatesLane: sends === 5 && next === 0, note: 'Deliberately unresolved test adapter; does not exercise sendBoundedFirebase. See bounded transport integration tests.' }));
  finish(); await first;

  const item = { createdAt: new Date(now - 61000), data: { type: 'new_booking' } };
  const ringUntil = fast.driverRingUntil(item);
  const { loader } = require('../../tests/helpers/loadTypeScript.cjs');
  const { nativeAndroidDriverPush } = loader()('../zwanga-backend/src/notifications/native-android-driver-push.ts');
  const payload = nativeAndroidDriverPush({ ...item, id: 'synthetic', title: 'Test', body: 'Test' }, 'synthetic', ringUntil);
  console.log(JSON.stringify({ probe: 'late-booking-sound-window', ageMs: 61000,
    soundWindowExpired: Date.parse(ringUntil) < now, transportTtlMs: payload.android.ttl,
    note: 'Booking business state is still pending in this scenario; see the native policy probe.' }));
}

function nativeProbe() {
  if (spawnSync('javac', ['-version'], { windowsHide: true }).status !== 0) {
    console.log(JSON.stringify({ probe: 'late-native-booking', skipped: 'JDK unavailable' })); return;
  }
  const java = fs.readFileSync(path.join(root, 'native/android/notifications/RideNotificationBundle.java'), 'utf8');
  const policy = java.slice(java.indexOf('final class RideNotificationBundle'), java.indexOf('  static Bundle action')) + '}';
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-delivery-audit-'));
  try {
    const file = path.join(directory, 'DeliveryPolicyAudit.java');
    fs.writeFileSync(file, `import java.util.*; import java.util.regex.*; import java.text.*;
class DriverAlertModule { static final String BUNDLED_CHANNEL="bundled", PHONE_CHANNEL="phone", LEGACY_CHANNEL="legacy"; }
${policy}
public class DeliveryPolicyAudit {
  public static void main(String[] args) {
    Map<String,String> d = new HashMap<>();
    d.put("type", "new_booking"); d.put("driverId", "00000000-0000-4000-8000-000000000001");
    d.put("bookingId", "00000000-0000-4000-8000-000000000002");
    d.put("notificationId", "00000000-0000-4000-8000-000000000003");
    d.put("ringUntil", "2026-10-26T12:01:00.000Z");
    long before = RideNotificationBundle.date("2026-10-26T12:00:59.000Z");
    long after = RideNotificationBundle.date("2026-10-26T12:01:01.000Z");
    System.out.println("{\\"probe\\":\\"late-native-booking\\",\\"acceptedAt59s\\":" +
      RideNotificationBundle.valid(d, before) + ",\\"acceptedAt61s\\":" + RideNotificationBundle.valid(d, after) + "}");
  }
}`);
    const build = spawnSync('javac', ['-encoding', 'UTF-8', '-d', directory, file], { encoding: 'utf8', timeout: 30000, windowsHide: true });
    assert.equal(build.status, 0, build.stderr);
    const run = spawnSync('java', ['-cp', directory, 'DeliveryPolicyAudit'], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(run.status, 0, run.stderr);
    process.stdout.write(run.stdout);
  } finally {
    // Only the freshly-created isolated directory, never a user-supplied path.
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

serverProbes().then(nativeProbe).catch(error => { console.error(error); process.exitCode = 1; });
