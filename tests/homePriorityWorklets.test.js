const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const babel = require('@babel/core');

// Use the app's actual production Babel configuration, not the hook test mocks.
// Missing UI-thread compilation can fail at runtime despite TypeScript passing.
for (const [file, minimum] of [
  ['components/home/SwipeableHomePriority.tsx', 7],
  ['features/home/homePriorityDismissal.ts', 1],
]) {
  test(`${file}: gesture callbacks compile into native worklets for production`, () => {
    const result = babel.transformFileSync(path.resolve(file), { envName: 'production' });
    const worklets = result.code.match(/__workletHash/g) ?? [];
    assert.ok(worklets.length >= minimum, `${worklets.length} worklets compiled; expected at least ${minimum}`);
  });
}
