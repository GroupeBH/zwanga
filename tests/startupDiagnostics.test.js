const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

test('startup breadcrumbs are bounded before reporter availability and contain no request data', () => {
  const api = loader()('services/startupDiagnostics.ts'), entries = [];
  for (let i = 0; i < 100; i++) api.recordStartupMilestone('restore_started');
  api.setStartupDiagnosticReporter(entry => entries.push(entry));
  assert.equal(entries.length, 16);
  api.recordStartupMilestone('session_saved');
  assert.equal(entries.at(-1).phase, 'session_saved');
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry).sort(), ['elapsedMs', 'phase']);
    assert.ok(entry.elapsedMs >= 0);
  }
  assert.doesNotThrow(() => api.setStartupDiagnosticReporter(() => { throw Error('Reporter unavailable'); }));
  assert.doesNotThrow(() => api.recordStartupMilestone('home_map_ready'));
});
