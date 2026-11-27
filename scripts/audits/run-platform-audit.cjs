/* global __dirname */
// Audit only: no inherited application secrets, no build, migration or deployment.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const mobile = path.resolve(__dirname, '../..');
const backend = path.resolve(mobile, '../zwanga-backend');
const { minimalEnvironment } = require(path.join(backend, 'test/load/isolation.cjs'));
const mode = process.argv[2];
const suffix = process.env.AUDIT_REPORT_SUFFIX || '';
if (suffix && !/^[a-z0-9-]+$/.test(suffix)) throw Error('Invalid audit report suffix');
const roots = Object.fromEntries(['admin', 'partner', 'web', 'backend'].map(name => [name, path.resolve(mobile, `../zwanga-${name}`)]));
function testsIn(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (['node_modules', '.next', '.git', 'dist', '.expo'].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? testsIn(file) : entry.name.endsWith('.test.cjs') ? [file] : [];
  }).sort();
}
const env = minimalEnvironment({ NODE_ENV: 'test', TZ: 'UTC', AWS_EC2_METADATA_DISABLED: 'true' });
const guard = path.join(mobile, 'tests/helpers/localOnlyNetwork.cjs');
let cwd = mobile;
let args;
let resumed = null;
if (mode === 'mobile' || mode === 'mobile-tail') {
  const files = require('../check-release.cjs').testFiles();
  const selected = mode === 'mobile-tail' ? files.filter(file => path.basename(file) >= 'tripRequestForm.test.js') : files;
  args = ['--require', guard, '--test', '--test-concurrency=2', '--test-reporter=tap', ...selected];
} else if (mode === 'admin' || mode === 'web') {
  cwd = roots[mode];
  args = ['--require', guard, '--test', '--test-concurrency=2', '--test-reporter=tap', ...testsIn(cwd)];
} else if (mode === 'partner') {
  cwd = roots.partner;
  args = ['--require', guard, path.join(cwd, 'node_modules/vitest/vitest.mjs'), 'run', '--no-cache', '--maxWorkers=2'];
} else if (mode === 'mobile-types') {
  args = [path.join(mobile, 'node_modules/typescript/bin/tsc'), '--noEmit', '--incremental', 'false'];
} else if (/^(admin|partner|web|backend)-types$/.test(mode)) {
  cwd = roots[mode.replace('-types', '')];
  args = [path.join(cwd, 'node_modules/typescript/bin/tsc'), '--noEmit', '--incremental', 'false'];
} else if (mode === 'backend-production-types') {
  cwd = backend;
  args = [path.join(cwd, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.build.json', '--noEmit', '--incremental', 'false'];
} else if (mode === 'backend-runtime' || mode === 'backend-remaining') {
  // Type checks are recorded separately; avoid rebuilding the entire TS program
  // for every suite on a workstation also running Metro and an emulator.
  cwd = backend;
  let remaining = [];
  if (mode === 'backend-remaining') {
    // Resume only files explicitly reported PASS. Pending/failed/interrupted files run again.
    const name = process.argv[3];
    if (!/^platform-audit-\d{4}-\d{2}-\d{2}-backend-runtime-[a-z0-9-]+\.log$/.test(name || '')) throw Error('Explicit local backend audit log required');
    const previousPath = path.join(mobile, '.expo', name);
    const previous = fs.readFileSync(previousPath, 'utf8');
    const passed = new Set([...previous.matchAll(/^PASS (src\/[^\r\n]+?\.spec\.ts)(?: \(|\r?$)/gm)].map(m => m[1]));
    if (!passed.size) throw Error('No completed suites to resume');
    const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
    const sourceFiles = walk(path.join(cwd, 'src'));
    if (sourceFiles.some(f => /\.[cm]?[jt]sx?$/.test(f) && fs.statSync(f).mtimeMs > fs.statSync(previousPath).birthtimeMs)) throw Error('Backend sources changed since first batch; full rerun required');
    const all = sourceFiles.filter(f => f.endsWith('.spec.ts')).map(f => path.relative(cwd, f).replaceAll('\\', '/')).sort();
    if ([...passed].some(file => !all.includes(file))) throw Error('Completed suite inventory has changed');
    remaining = all.filter(file => !passed.has(file));
    if (!remaining.length) throw Error('All suites already completed');
    resumed = { sourceLog: name, passedSuitesNotRerun: passed.size, selectedSuites: remaining.length, totalFiles: all.length };
    console.log(JSON.stringify(resumed));
  }
  args = ['--require', guard, path.join(cwd, 'node_modules/jest/bin/jest.js'), ...(resumed ? ['--maxWorkers=2', '--runTestsByPath', ...remaining] : ['--runInBand']), '--silent',
    '--reporters=default', '--reporters=' + path.join(mobile, 'scripts/audits/jest-progress.cjs'),
    '--globals=' + JSON.stringify({ 'ts-jest': { isolatedModules: true } }), '--json',
    '--outputFile=' + path.join(mobile, '.expo', `platform-${mode}-${new Date().toISOString().slice(0, 10)}${suffix ? '-' + suffix : ''}.json`)];
} else if (mode === 'commerce') {
  const bin = process.argv[3];
  if (!bin || !fs.existsSync(path.join(bin, process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl'))) throw Error('Explicit disposable PostgreSQL binary directory required');
  env.AUDIT_POSTGRES_BIN = path.resolve(bin);
  args = ['--test', '--test-reporter=tap', path.join(mobile, 'tests/integration/commerceBackendE2E.test.cjs')];
} else throw Error('Unknown audit mode');
const output = path.join(mobile, '.expo', `platform-audit-${new Date().toISOString().slice(0, 10)}-${mode}${suffix ? '-' + suffix : ''}`);
const log = fs.createWriteStream(output + '.log');
const start = Date.now();
const child = spawn(process.execPath, args, { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let pending = '';
const consume = chunk => {
  log.write(chunk); pending += chunk.toString();
  const lines = pending.split('\n'); pending = lines.pop();
  for (const line of lines) if (/^(not ok|# (tests|pass|fail|skipped|duration_ms)|.*error TS)/.test(line)) console.log(line.slice(0, 1000));
};
child.stdout.on('data', consume); child.stderr.on('data', consume);
const timeout = setTimeout(() => child.kill(), 20 * 60_000);
child.on('error', error => { console.error(error.code || 'AUDIT_PROCESS_ERROR'); process.exitCode = 1; });
child.on('close', (code, signal) => {
  clearTimeout(timeout);
  const result = { mode, exitCode: code, signal, durationMs: Date.now() - start, log: output + '.log', ...(resumed ? { resumed } : {}) };
  log.end(); fs.writeFileSync(output + '.json', JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result)); process.exitCode = code ?? 1;
});
