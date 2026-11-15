/* global __dirname */
// Read-only metadata check. Local database only, never prints credentials or user records.
const fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../../zwanga-backend');
const backend = createRequire(path.join(root, 'package.json'));
async function main() {
  const config = backend('dotenv').parse(fs.readFileSync(path.join(root, '.env')));
  const url = config.DATABASE_URL ? new URL(config.DATABASE_URL) : null;
  const host = url?.hostname ?? config.DATABASE_HOST ?? 'localhost';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw Error('Local database required');
  const client = new (backend('pg').Client)({ ...(url ? { connectionString: url.href } : {
    host, port: Number(config.DATABASE_PORT || 5432), user: config.DATABASE_USER,
    password: config.DATABASE_PASSWORD, database: config.DATABASE_NAME,
  }), connectionTimeoutMillis: 4000, statement_timeout: 5000 });
  try {
    await client.connect(); await client.query('BEGIN READ ONLY');
    const tables = (await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
      AND tablename IN ('asset_credits','asset_credit_products','asset_credit_rate_sources','asset_credit_rate_allocations')`)).rows;
    const rateColumn = (await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='public'
      AND table_name='asset_credits' AND column_name='repaymentBps'`)).rowCount > 0;
    console.log(JSON.stringify({ localOnly: true, readOnly: true, tables: tables.map(t => t.tablename), rateColumn }));
  } finally { await client.end(); }
}
main().catch(() => { console.error('Local metadata unavailable; credentials not logged'); process.exitCode = 1; });
