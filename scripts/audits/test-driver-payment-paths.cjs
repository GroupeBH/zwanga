/* global __dirname */
const { spawnSync } = require('node:child_process');
const { resolve, join } = require('node:path');
const backend = resolve(__dirname, '../../../zwanga-backend');
const { minimalEnvironment } = require(join(backend, 'test/load/isolation.cjs'));
const bin = process.env.MIXED_CASH_TEST_POSTGRES_BIN;
if (!bin) throw Error('Set MIXED_CASH_TEST_POSTGRES_BIN to local disposable PostgreSQL/PostGIS binaries.');
const result = spawnSync(process.execPath, ['--require', resolve(__dirname, '../../tests/helpers/localOnlyNetwork.cjs'),
  join(backend, 'node_modules/jest/bin/jest.js'), '--runInBand',
  'src/notifications/driver-payment-notification.spec.ts', 'src/notifications/driver-payment-postgres.spec.ts',
  'src/notifications/transactional-notifications.subscriber.spec.ts', 'src/notifications/ride-realtime-delivery.spec.ts',
  'src/notifications/notifications.service.spec.ts', 'src/bookings/cash-receipts.spec.ts',
  'src/bookings/bookings.service.spec.ts',
], { cwd: backend, windowsHide: true, stdio: 'inherit', env: minimalEnvironment({ NODE_ENV: 'test',
  AWS_EC2_METADATA_DISABLED: 'true', MIXED_CASH_TEST_POSTGRES_BIN: bin, RIDE_AUDIT_MOBILE_ROOT: resolve(__dirname, '../..') }) });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
