/* global __dirname */
/* Full local/CI gate. No build, deploy, native generation or environment output. */
const { readdirSync } = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
function testFiles(directory = path.join(root, 'tests')) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? testFiles(filename) : entry.name.endsWith('.test.js') ? [filename] : [];
  }).sort();
}

function runGate(run = spawnSync) {
  const tests = testFiles();
  if (!tests.length) throw new Error('No regression tests found');
  const checks = [
    ['Native source parity', ['scripts/check-native-sources.cjs']],
    ['TypeScript', ['node_modules/typescript/bin/tsc', '--noEmit']],
    ['ESLint (errors)', ['node_modules/eslint/bin/eslint.js', '.', '--quiet']],
    ['Network boundaries', ['scripts/check-network-boundaries.js']],
    ['Source size', ['scripts/check-source-size.cjs']],
    ['Regression tests', ['--test', '--test-concurrency=2', '--test-reporter=tap', ...tests]],
  ];
  for (const [label, args] of checks) {
    console.log(`[release-check] ${label}`);
    const result = run(process.execPath, args, { cwd: root, stdio: 'inherit', timeout: 20 * 60_000 });
    if (result.error || result.signal || result.status !== 0) return 1;
  }
  return 0;
}

if (require.main === module) process.exitCode = runGate();
module.exports = { runGate, testFiles };
