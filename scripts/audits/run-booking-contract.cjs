/* global __dirname */
// No application environment or real provider credentials enter the child.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const { minimalEnvironment } = require(path.resolve(root, '../zwanga-backend/test/load/isolation.cjs'));
if (!process.env.AUDIT_POSTGRES_BIN) throw Error('Set AUDIT_POSTGRES_BIN to local PostgreSQL/PostGIS binaries.');
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1',
  path.join(root, 'tests/integration/bookingBackendE2E.test.cjs')], {
  cwd: root, windowsHide: true, stdio: 'inherit',
  env: minimalEnvironment({ NODE_ENV: 'test', TZ: 'UTC', AWS_EC2_METADATA_DISABLED: 'true',
    AUDIT_POSTGRES_BIN: process.env.AUDIT_POSTGRES_BIN }),
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
