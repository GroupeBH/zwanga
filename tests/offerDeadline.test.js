const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { offerDeadline, offerRemaining } = loader()('features/notifications/offerDeadline.ts');
const start = { wall: 100_000, monotonic: 1000 };
const deadline = offerDeadline('2026-10-22T12:00:30Z', '2026-10-22T12:00:00Z', start);
test('server budget starts at HTTP start; delayed delivery/render never resets it', () => {
  assert.equal(offerRemaining(deadline, { wall: 112_000, monotonic: 13000 }), 18);
  assert.equal(offerRemaining(deadline, { wall: 140_000, monotonic: 41000 }), 0);
});
test('moving the phone clock backwards cannot extend the server budget', () => {
  assert.equal(offerRemaining(deadline, { wall: 0, monotonic: 31000 }), 0);
});
test('invalid, elapsed, absent deadlines fail closed and excessive budgets are capped', () => {
  assert.equal(offerRemaining(undefined, start), 0);
  assert.equal(offerRemaining(offerDeadline('bad', 'bad', start), start), 0);
  assert.equal(offerRemaining(offerDeadline('2026-10-22T11:00:00Z', '2026-10-22T12:00:00Z', start), start), 0);
  assert.equal(offerRemaining(offerDeadline('2026-10-23T12:00:00Z', '2026-10-22T12:00:00Z', start), start), 120);
});
