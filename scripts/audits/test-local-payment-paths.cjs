/* global __dirname */
// Real disposable PostgreSQL; synthetic accounts/provider responses only.
const { spawnSync } = require('node:child_process');
const { resolve, join } = require('node:path');
const backend = resolve(__dirname, '../../../zwanga-backend');
const { minimalEnvironment } = require(join(backend, 'test/load/isolation.cjs'));
const bin = process.env.MIXED_CASH_TEST_POSTGRES_BIN;
if (!bin) throw Error('Set MIXED_CASH_TEST_POSTGRES_BIN to local PostgreSQL/PostGIS binaries.');
const result = spawnSync(process.execPath, [
  '--require', resolve(__dirname, '../../tests/helpers/localOnlyNetwork.cjs'),
  join(backend, 'node_modules/jest/bin/jest.js'), '--runInBand',
  'src/bookings/mixed-cash-payment-postgres.spec.ts',
  'src/bookings/token-cash-fallback-postgres.spec.ts',
  'src/wallet/wallet.service.spec.ts', 'src/wallet/wallet-withdrawals.service.spec.ts',
], {
  cwd: backend, windowsHide: true, stdio: 'inherit',
  env: minimalEnvironment({ NODE_ENV: 'test', AWS_EC2_METADATA_DISABLED: 'true', MIXED_CASH_TEST_POSTGRES_BIN: bin }),
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
