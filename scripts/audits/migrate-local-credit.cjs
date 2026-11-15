/* global __dirname */
// Explicitly approved local-test operation. Never discover/run unrelated migrations.
const fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../../zwanga-backend');
const backend = createRequire(path.join(root, 'package.json'));
const selected = [
  ['1780000127000', 'EquipmentAssetCredits'],
  ['1780000129000', 'ContractAssetCreditRates'],
];
async function main() {
  const config = backend('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
  const url = config.DATABASE_URL ? new URL(config.DATABASE_URL) : null;
  const host = url?.hostname ?? config.DATABASE_HOST ?? 'localhost';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw Error('LOCAL_DATABASE_REQUIRED');
  const localHost = host === 'localhost' ? '127.0.0.1' : host;
  if (url) url.hostname = localHost;
  backend('ts-node').register({ transpileOnly: true, project: path.join(root, 'tsconfig.json') });
  const { restrictConnections } = backend(path.join(root, 'test/load/isolation.cjs'));
  const port = Number(url?.port || config.DATABASE_PORT || 5432);
  const guard = restrictConnections([port]);
  const db = new (backend('typeorm').DataSource)({
    type: 'postgres', ...(url ? { url: url.href } : {
      host: localHost, port, username: config.DATABASE_USER, password: config.DATABASE_PASSWORD, database: config.DATABASE_NAME,
    }), synchronize: false, migrationsRun: false, logging: false, migrationsTableName: 'typeorm_migrations',
    migrations: selected.map(([stamp, name]) => backend(path.join(root, `src/database/migrations/${stamp}-${name}.ts`))[name + stamp]),
    extra: { connectionTimeoutMillis: 4000, statement_timeout: 30000 },
  });
  try {
    await db.initialize();
    const recorded = await db.query('SELECT name FROM typeorm_migrations WHERE timestamp BETWEEN $1 AND $2 ORDER BY timestamp', [1780000124000, 1780000129000]);
    if (!recorded.some(m => m.name === 'AssetCredits1780000124000')) throw Error('BASE_CREDIT_MIGRATION_REQUIRED');
    const pending = selected.map(([stamp, name]) => name + stamp).filter(name => !recorded.some(m => m.name === name));
    console.log(JSON.stringify({ localOnly: true, mode: process.argv.includes('--apply') ? 'apply' : 'inspect', recorded: recorded.map(m => m.name), pending }));
    if (!process.argv.includes('--apply')) return;
    // Financial data must remain unchanged: migrations only add schema and enable catalogue kinds.
    const fingerprint = () => db.query(`SELECT
      (SELECT count(*)::text FROM asset_credits) AS credits,
      (SELECT count(*)::text FROM asset_credit_entries) AS entries,
      (SELECT md5(COALESCE(string_agg(id::text || ':' || balance::text || ':' || "withdrawableBalance"::text, ',' ORDER BY id),'')) FROM wallet_accounts) AS balances`);
    const before = JSON.stringify(await fingerprint());
    const applied = await db.runMigrations({ transaction: 'all' });
    if (applied.some(m => !pending.includes(m.name))) throw Error('UNEXPECTED_MIGRATION');
    const financialRowsUnchanged = before === JSON.stringify(await fingerprint());
    console.log(JSON.stringify({ localOnly: true, applied: applied.map(m => m.name), financialRowsUnchanged, blockedExternalConnections: guard.count() }));
    if (!financialRowsUnchanged) throw Error('FINANCIAL_DATA_CHANGED_OR_CONCURRENT_WRITE');
  } finally { if (db.isInitialized) await db.destroy(); guard.restore(); }
}
main().catch(error => {
  // Do not expose connection strings or SQL parameters in diagnostics.
  console.error('Local credit migration failed:', error.code || 'check schema and transaction preconditions'); process.exitCode = 1;
});
