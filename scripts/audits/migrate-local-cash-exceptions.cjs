/* global __dirname */
// Approved local-test operation: one migration, no rollout activation or payments.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../../zwanga-backend');
const backend = createRequire(path.join(root, 'package.json'));
const upgrade = process.argv.includes('--upgrade');
const migrationClass = upgrade ? 'UpgradeDriverCashExceptions' : 'DriverCashExceptions';
const stamp = upgrade ? 1780000148000 : 1780000145000;
const name = migrationClass + stamp;
async function main() {
  const apply = process.argv.includes('--apply');
  if (apply && !process.argv.includes('--confirm-local-test')) throw Error('EXPLICIT_LOCAL_TEST_CONFIRMATION_REQUIRED');
  const config = backend('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
  const url = config.DATABASE_URL ? new URL(config.DATABASE_URL) : null;
  const host = url?.hostname ?? config.DATABASE_HOST ?? 'localhost';
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(host)) throw Error('LOCAL_DATABASE_REQUIRED');
  const localHost = host === 'localhost' ? '127.0.0.1' : host;
  if (url) url.hostname = localHost;
  const port = Number(url?.port || config.DATABASE_PORT || 5432);
  const guard = backend(path.join(root, 'test/load/isolation.cjs')).restrictConnections([port]);
  backend('ts-node').register({ transpileOnly: true, project: path.join(root, 'tsconfig.json') });
  const db = new (backend('typeorm').DataSource)({ type: 'postgres',
    ...(url ? { url: url.href } : { host: localHost, port, username: config.DATABASE_USER,
      password: config.DATABASE_PASSWORD, database: config.DATABASE_NAME }),
    synchronize: false, migrationsRun: false, logging: false,
    extra: { connectionTimeoutMillis: 4000, statement_timeout: 30000 },
  });
  let runner;
  const report = { at: new Date().toISOString(), localOnly: true, mode: apply ? 'apply' : 'inspect', migration: name };
  try {
    await db.initialize(); runner = db.createQueryRunner(); await runner.connect();
    await runner.startTransaction();
    await runner.query("SET LOCAL lock_timeout = '5s'");
    await runner.query("SET LOCAL statement_timeout = '30s'");
    await runner.query("SELECT pg_advisory_xact_lock(hashtext('zwanga-local-cash-exceptions-migration'))");
    const recorded = await runner.query('SELECT name FROM typeorm_migrations WHERE name=$1', [name]);
    const [shape] = await runner.query("SELECT to_regclass('driver_cash_exception_trips') IS NOT NULL AS present, to_regprocedure('zwanga_booking_cash_guard()') IS NOT NULL AS guard");
    report.alreadyRecorded = recorded.length === 1; report.tablePresentBefore = shape.present; report.cashGuardPresent = shape.guard;
    fs.writeFileSync(path.resolve(__dirname, '../../.expo/local-cash-exceptions-inspection-2026-11-27.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    if (!shape.guard || (!upgrade && shape.present !== report.alreadyRecorded) ||
        (upgrade && report.alreadyRecorded && !shape.present)) throw Error('SCHEMA_HISTORY_MISMATCH');
    if (upgrade) {
      const previous = await runner.query('SELECT name FROM typeorm_migrations WHERE name=$1', ['DriverCashExceptions1780000145000']);
      if (previous.length !== 1) throw Error('CASH_UPGRADE_PREDECESSOR_REQUIRED');
    }
    if (!apply || report.alreadyRecorded) { await runner.rollbackTransaction(); console.log(JSON.stringify(report)); return; }
    const fingerprint = () => runner.query(`SELECT
      (SELECT md5(COALESCE(string_agg(id::text || ':' || balance::text || ':' || "withdrawableBalance"::text || ':' || "reservedCashCommissionBalance"::text, ',' ORDER BY id),'')) FROM wallet_accounts) AS wallets,
      (SELECT md5(COALESCE(string_agg(to_jsonb(l)::text, ',' ORDER BY id),'')) FROM wallet_ledger_entries l) AS ledger,
      (SELECT md5(COALESCE(string_agg(to_jsonb(b)::text, ',' ORDER BY id),'')) FROM bookings b) AS bookings,
      (SELECT md5(COALESCE(string_agg(to_jsonb(r)::text, ',' ORDER BY "driverId"),'')) FROM driver_cash_restrictions r) AS restrictions,
      (SELECT md5(COALESCE(string_agg(id::text || ':' || "isActive"::text || ':' || status::text, ',' ORDER BY id),'')) FROM users) AS users`);
    const before = JSON.stringify(await fingerprint());
    const Migration = backend(path.join(root, `src/database/migrations/${stamp}-${migrationClass}.ts`))[name];
    await new Migration().up(runner);
    await runner.query('INSERT INTO typeorm_migrations(timestamp,name) VALUES($1,$2)', [stamp, name]);
    report.financialRowsUnchanged = before === JSON.stringify(await fingerprint());
    const [rollout] = await runner.query('SELECT enabled FROM driver_cash_exception_rollout WHERE id');
    report.rolloutEnabled = rollout?.enabled;
    if (!report.financialRowsUnchanged || report.rolloutEnabled !== false) throw Error('PRESERVATION_CHECK_FAILED');
    await runner.commitTransaction(); report.applied = true;
    report.blockedExternalConnections = guard.count();
    fs.writeFileSync(path.resolve(__dirname, '../../.expo/local-cash-exceptions-migration-2026-11-27.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally {
    if (runner?.isTransactionActive) await runner.rollbackTransaction();
    if (runner) await runner.release();
    if (db.isInitialized) await db.destroy();
    guard.restore();
  }
}
main().catch(error => {
  // Never log connection strings, data rows or SQL parameters.
  console.error('Local migration failed:', /^[A-Z_]{5,}$/.test(error.message) ? error.message : error.code || 'CHECK_TRANSACTION_PRECONDITIONS');
  process.exitCode = 1;
});
