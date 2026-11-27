/* global __dirname */
// Local audit only: disposable databases, no inherited application secrets.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mobile = path.resolve(__dirname, '../..');
const backend = path.resolve(mobile, '../zwanga-backend');
const { minimalEnvironment } = require(path.join(backend, 'test/load/isolation.cjs'));
const mode = process.argv[2];
const bin = process.argv[3];
const stamp = new Date().toISOString().slice(0, 10);
const suffix = process.env.AUDIT_REPORT_SUFFIX || '';
if (suffix && !/^[a-z0-9-]+$/.test(suffix)) throw Error('Invalid local report suffix');
const output = path.join(mobile, '.expo', `isolated-e2e-${stamp}-${mode}${suffix ? '-' + suffix : ''}`);
const pgFlags = ['ASSET', 'AUDIT', 'INSTALLATION_UPDATES', 'APP_UPDATES', 'MIXED_CASH',
  'PAID_SUBSIDY', 'PAYOUT', 'REFERRAL', 'ACCOUNT_LIFECYCLE', 'TRIP_SEARCH', 'WELCOME_BONUS',
  'WALLET', 'PIN_RESET', 'NOTIFICATIONS', 'TOKEN_VALUE', 'KYC_EVIDENCE', 'DISPATCH',
  'RESILIENCE', 'FINANCIAL_RECOVERY', 'DRIVER_FINANCE', 'PHONE_REGISTRATION', 'MOBILE', 'NEARBY_RING',
  'ARRIVAL', 'CO_PASSENGERS', 'DRIVER_QR', 'PAYMENT_ARRIVAL', 'PERFORMANCE', 'PRO_CREDIT', 'SECURITY', 'ZONES', 'PAWAPAY'];
const env = minimalEnvironment({ NODE_ENV: 'test', TZ: 'UTC', AWS_EC2_METADATA_DISABLED: 'true' });
const guard = path.join(mobile, 'tests/helpers/localOnlyNetwork.cjs');
let args, cwd = mobile;
if (!['release', 'integration', 'postgres', 'postgres-runtime', 'postgres-recovery', 'postgres-fixes', 'screen-audit-postgres', 'screen-cash-postgres', 'cash-upgrade-postgres', 'backend-regressions', 'auth', 'booking', 'credits', 'sequential', 'sequential-probe', 'bargaining'].includes(mode)) throw Error('Unknown isolated audit mode');
if (mode !== 'release') {
  if (!bin || !fs.existsSync(path.join(bin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'))) throw Error('Explicit local PostgreSQL binaries required');
  for (const flag of pgFlags) env[`${flag}_TEST_POSTGRES_BIN`] = path.resolve(bin);
  env.AUDIT_POSTGRES_BIN = path.resolve(bin);
  env.RIDE_AUDIT_MOBILE_ROOT = mobile;
}
if (mode === 'release') args = [path.join(mobile, 'scripts/check-release.cjs')];
if (mode === 'integration') args = [path.join(mobile, 'scripts/check-integration.cjs')];
if (mode === 'postgres' || mode === 'postgres-runtime') {
  cwd = backend;
  args = ['--require', guard, path.join(backend, 'node_modules/jest/bin/jest.js'), '--runInBand',
    '--testPathPatterns=postgres.*spec', '--testPathIgnorePatterns=sequential-dispatch.postgres.spec.ts',
    ...(mode === 'postgres-runtime' ? ['--globals=' + JSON.stringify({ 'ts-jest': { isolatedModules: true } })] : []),
    '--json', '--outputFile=' + output + '.json'];
}
if (mode === 'backend-regressions' || mode === 'postgres-recovery') {
  cwd = backend;
  args = ['--require', guard, path.join(backend, 'node_modules/jest/bin/jest.js'), '--runInBand', '--runTestsByPath',
    ...(mode === 'backend-regressions' ? ['src/driver-settlements/driver-cash-subsidy.spec.ts',
      'src/trip-requests/request-search-map.spec.ts'] : ['src/database/driver-payout-recovery-postgres.spec.ts']),
    '--json', '--outputFile=' + output + '.json'];
}
if (mode === 'postgres-fixes') {
  cwd = backend;
  args = ['--require', guard, path.join(backend, 'node_modules/jest/bin/jest.js'), '--runInBand', '--runTestsByPath',
    'src/bookings/payment-arrival.postgres.spec.ts', 'src/bookings/security-regressions.postgres.spec.ts',
    'src/database/financial-recovery-postgres.spec.ts', 'src/payments/flexpay-deposit-evidence.spec.ts',
    '--json', '--outputFile=' + output + '.json'];
}
if (mode === 'sequential' || mode === 'sequential-probe' || mode === 'bargaining') args = [path.join(backend, 'test/run-sequential-dispatch.cjs'),
  mode === 'bargaining' ? 'src/trip-requests/dispatch/dispatch-postgres.spec.ts' : 'src/trip-requests/dispatch/sequential-dispatch.postgres.spec.ts', '--json', '--outputFile=' + output + '.json',
  ...(mode === 'sequential-probe' ? ['--testNamePattern=local cross-repository flow'] : []),
  ...(mode === 'bargaining' ? ['--testNamePattern=bargaining'] : [])];
if (mode === 'screen-audit-postgres') {
  cwd = backend;
  args = ['--require', guard, path.join(backend, 'node_modules/jest/bin/jest.js'), '--runInBand', '--runTestsByPath',
    'src/bookings/cash-declaration-postgres.spec.ts', 'src/bookings/token-cash-fallback-postgres.spec.ts',
    'src/bookings/booking-financial-consistency-postgres.spec.ts', 'src/trip-requests/change-request-driver.postgres.spec.ts',
    'src/trips/trip-co-passengers.postgres.spec.ts', 'src/users/public-driver/public-driver.postgres.spec.ts',
    'src/mobile-operations/mobile-postgres.spec.ts', 'src/pro-services/document-case.postgres.spec.ts',
    'src/partners/fleet-applications.postgres.spec.ts', 'src/partners/fleet-registry.postgres.spec.ts',
    'src/asset-credit/asset-credit.postgres.spec.ts', 'src/financing/tests/pro-credit.postgres.spec.ts',
    'src/financing/tests/credit-collections.postgres.spec.ts',
    '--json', '--outputFile=' + output + '.json'];
}
if (mode === 'screen-cash-postgres') {
  cwd = backend;
  args = ['--require', guard, path.join(backend, 'node_modules/jest/bin/jest.js'), '--runInBand', '--runTestsByPath',
    'src/bookings/cash-declaration-postgres.spec.ts', '--json', '--outputFile=' + output + '.json'];
}
if (mode === 'cash-upgrade-postgres') {
  cwd = backend;
  args = ['--require', guard, path.join(backend, 'node_modules/jest/bin/jest.js'), '--runInBand', '--runTestsByPath',
    'src/database/driver-finance-postgres.spec.ts', 'src/driver-finance/cash-exception-migration.spec.ts',
    'src/bookings/cash-declaration-postgres.spec.ts', 'src/bookings/token-cash-fallback-postgres.spec.ts',
    '--json', '--outputFile=' + output + '.json'];
}
if (mode === 'auth') args = [path.join(mobile, 'scripts/test-auth-local.cjs'), path.resolve(bin)];
if (mode === 'booking') args = ['--test', path.join(mobile, 'tests/integration/bookingBackendE2E.test.cjs')];
if (mode === 'credits') args = ['--test', path.join(mobile, 'tests/integration/assetCreditBackendE2E.test.cjs')];
const log = fs.createWriteStream(output + '.log');
const start = Date.now();
const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let pending = '';
const consume = chunk => {
  log.write(chunk); pending += chunk.toString();
  const lines = pending.split('\n'); pending = lines.pop();
  for (const line of lines) if (/^(PASS|FAIL|Test Suites:|Tests:|# (tests|pass|fail|skipped|duration_ms)|not ok|\[release-check\])/.test(line)) console.log(line.slice(0, 1200));
};
child.stdout.on('data', consume); child.stderr.on('data', consume);
child.on('error', e => { console.error(e.message); process.exitCode = 1; });
child.on('close', code => {
  log.end(); console.log(JSON.stringify({ mode, exitCode: code, durationMs: Date.now() - start, log: output + '.log' }));
  process.exitCode = code ?? 1;
});
