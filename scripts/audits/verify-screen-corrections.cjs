/* global __dirname */
// Regression successor to the original diagnostic probes. Never overwrites their historical findings.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const target = path.join(root, '.expo', 'screen-corrections-regression-' + new Date().toISOString().slice(0, 10));
const files = ['auditScreenCorrections', 'proServiceForm', 'driverAlertSettingsUx', 'proServices', 'platformAuditCorrections',
  'paymentReceiptSharing', 'proServiceUI'];
const result = spawnSync(process.execPath, ['--require', path.join(root, 'tests/helpers/localOnlyNetwork.cjs'),
  '--test', '--test-concurrency=2', '--test-reporter=tap', ...files.map(name => path.join(root, `tests/${name}.test.js`))],
{ cwd: root, encoding: 'utf8', timeout: 180000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target + '.log', (result.stdout || '') + (result.stderr || ''));
const count = key => Number(result.stdout?.match(new RegExp('^# ' + key + ' (\\d+)$', 'm'))?.[1] ?? 0);
const report = { scope: 'Real mobile modules, simulated native/network dependencies; not device certification',
  files, tests: count('tests'), passed: count('pass'), failed: count('fail'), skipped: count('skipped'),
  exitCode: result.status, signal: result.signal, complete: result.status === 0 && count('tests') > 0 };
fs.writeFileSync(target + '.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (!report.complete) { console.error((result.stdout || '').slice(-6000)); process.exitCode = 1; }
