/* global __dirname */
// Explicit release integration gate. Fixtures own disposable databases and deny
// external connections; never uses DATABASE_URL or the habitual backend on 5200.
const { existsSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const suites = ['bookingBackendE2E.test.cjs', 'assetCreditBackendE2E.test.cjs', 'commerceBackendE2E.test.cjs']
  .map(file => path.join('tests', 'integration', file));
function runIntegration(run = spawnSync, environment = process.env, exists = existsSync) {
  const bin = environment.AUDIT_POSTGRES_BIN;
  const extension = process.platform === 'win32' ? '.exe' : '';
  if (!bin || !path.isAbsolute(bin) || !['initdb', 'pg_ctl', 'postgres'].every(file => exists(path.join(bin, file + extension)))) {
    console.error('[integration-check] AUDIT_POSTGRES_BIN must identify installed PostgreSQL binaries for disposable tests. No tests skipped as successful.');
    return 1;
  }
  for (const suite of suites) {
    console.log(`[integration-check] ${suite}`);
    const result = run(process.execPath, ['--test', '--test-concurrency=1', '--test-reporter=tap', suite],
      { cwd: root, env: environment, stdio: 'inherit', timeout: 10 * 60_000 });
    if (result.error || result.signal || result.status !== 0) return 1;
  }
  // Authentication needs its own disposable Redis lifecycle as well as PostgreSQL.
  const auth = run(process.execPath, [path.join('scripts', 'test-auth-local.cjs'), bin],
    { cwd: root, env: environment, stdio: 'inherit', timeout: 10 * 60_000 });
  if (auth.error || auth.signal || auth.status !== 0) return 1;
  return 0;
}
if (require.main === module) process.exitCode = runIntegration();
module.exports = { runIntegration, suites };
