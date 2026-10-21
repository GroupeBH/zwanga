const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

test('iOS inactive interruptions pause work but retain the visit until real background', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  let listener;
  const state = { currentState: 'active', addEventListener: (_name, fn) => { listener = fn; return { remove() {} }; } };
  const activity = loader({ 'react-native': { AppState: state } })('services/appActivity.ts');
  const unsubscribe = activity.subscribeAppActivity(() => {});
  const move = status => { t.mock.timers.tick(10); state.currentState = status; listener(status); };
  move('inactive'); assert.equal(activity.isAppActive(), false); assert.equal(activity.isAppForeground(), true);
  move('active'); assert.equal(activity.getAppActiveSince(), 100000);
  move('background'); assert.equal(activity.isAppForeground(), false);
  move('inactive'); assert.equal(activity.isAppForeground(), false);
  move('active'); assert.equal(activity.getAppActiveSince(), 100050);
  unsubscribe();
});

test('all entry consumers share the native foreground boundary, including a delayed mount', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  let listener;
  const state = { currentState: 'active', addEventListener: (_name, callback) => {
    listener = callback; return { remove() {} };
  } };
  const activity = loader({ 'react-native': { AppState: state } })('services/appActivity.ts');
  const boundaries = [];
  const unsubscribe = activity.subscribeAppActivity(() => boundaries.push(activity.getAppActiveSince()));
  assert.equal(activity.getAppActiveSince(), 100000);
  t.mock.timers.tick(10); state.currentState = 'background'; listener('background');
  t.mock.timers.tick(20); state.currentState = 'active'; listener('active');
  assert.equal(activity.getAppActiveSince(), 100030);
  assert.equal(boundaries.at(-1), 100030, 'boundary updated before React subscribers');
  t.mock.timers.tick(100); listener('active');
  assert.equal(activity.getAppActiveSince(), 100030, 'mounts/duplicate active events do not move the boundary');
  unsubscribe();
});
