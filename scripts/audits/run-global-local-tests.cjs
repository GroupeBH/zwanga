/* global __dirname */
// Explicit local audit, without application .env, credentials or provider traffic.
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const mobile = path.resolve(__dirname, '../..');
const backend = path.resolve(mobile, '../zwanga-backend');
const { minimalEnvironment } = require(path.join(backend, 'test/load/isolation.cjs'));
const mode = process.argv[2];
const postgres = process.env.AUDIT_POSTGRES_BIN;
const suffix = process.env.AUDIT_REPORT_SUFFIX || '';
if (suffix && !/^[a-z0-9-]+$/.test(suffix)) throw Error('Invalid local report suffix');
const needsPostgres = ['integration', 'integration-extra', 'notifications', 'sequential', 'sequential-probe', 'account-lifecycle'].includes(mode);
const output = path.join(mobile, '.expo', 'global-e2e-' + mode + '-20261103' + (suffix ? '-' + suffix : ''));
const jest = path.join(backend, 'node_modules/jest/bin/jest.js');
const guard = path.join(mobile, 'tests/helpers/localOnlyNetwork.cjs');
const integration = [
  'src/trip-requests/dispatch/dispatch-postgres.spec.ts',
  'src/trip-requests/change-request-driver.postgres.spec.ts',
  'src/notifications/driver-payment-postgres.spec.ts',
  'src/bookings/mixed-cash-payment-postgres.spec.ts',
  'src/bookings/token-cash-fallback-postgres.spec.ts',
  'src/bookings/booking-financial-consistency-postgres.spec.ts',
  'src/database/session-rotation-postgres.spec.ts',
  'src/database/registration-phone-postgres.spec.ts',
  'src/store-management/store-postgres.spec.ts',
];
let args;
if (mode === 'backend') args = ['--require', guard, jest, '--runInBand', '--silent', '--json', '--outputFile=' + output + '.json'];
else if (mode === 'types') args = [path.join(backend, 'node_modules/typescript/bin/tsc'), '--noEmit', '--incremental', 'false'];
else if (mode === 'account-lifecycle') args = ['--require', guard, jest, '--runInBand',
  'src/users/account-lifecycle-postgres.spec.ts', '--json', '--outputFile=' + output + '.json'];
else if (mode === 'integration' || mode === 'integration-extra') args = ['--require', guard, jest, '--runInBand', ...(mode === 'integration-extra' ? integration.slice(5) : integration), '--json', '--outputFile=' + output + '.json'];
else if (mode === 'notifications') args = ['--require', guard, jest, '--runInBand',
  'src/notifications/alert-reliability-postgres.spec.ts', '--json', '--outputFile=' + output + '.json'];
else if (mode === 'sequential' || mode === 'sequential-probe') args = [path.join(backend, 'test/run-sequential-dispatch.cjs'),
  'src/trip-requests/dispatch/sequential-dispatch.postgres.spec.ts', '--json', '--outputFile=' + output + '.json',
  ...(mode === 'sequential-probe' ? ['--testNamePattern=local cross-repository flow', '--setupFiles=' + path.join(__dirname, 'nest-local-errors.cjs')] : [])];
else throw Error('Choose backend, types, integration, integration-extra, notifications, sequential, sequential-probe or account-lifecycle.');
if (needsPostgres && (!postgres || !fs.existsSync(path.join(postgres, 'pg_ctl.exe'))))
  throw Error('Explicit local PostgreSQL/PostGIS binaries required.');
const env = minimalEnvironment({ NODE_ENV: 'test', TZ: 'UTC', AWS_EC2_METADATA_DISABLED: 'true',
  ...(needsPostgres ? {
    DISPATCH_TEST_POSTGRES_BIN: postgres, MIXED_CASH_TEST_POSTGRES_BIN: postgres,
    AUDIT_TEST_POSTGRES_BIN: postgres, PAYOUT_TEST_POSTGRES_BIN: postgres, PHONE_REGISTRATION_TEST_POSTGRES_BIN: postgres,
    NOTIFICATIONS_TEST_POSTGRES_BIN: postgres,
    ...(mode === 'account-lifecycle' ? { ACCOUNT_LIFECYCLE_TEST_POSTGRES_BIN: postgres } : {}),
    RIDE_AUDIT_MOBILE_ROOT: mobile,
  } : {}),
});
const log = fs.createWriteStream(output + '.log');
const child = spawn(process.execPath, args, { cwd: backend, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
child.stdout.pipe(log); child.stderr.pipe(log);
child.on('error', error => { console.error(error.message); log.end(); process.exitCode = 1; });
child.on('exit', code => { log.end(); console.log(JSON.stringify({ mode, exitCode: code, log: output + '.log' })); process.exitCode = code ?? 1; });
