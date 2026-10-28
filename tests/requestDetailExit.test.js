const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
function fixture(platform) {
  const hooks = hookHarness(), routes = [], router = { replace: route => routes.push(route) };
  const state = { active: true, scope: 'owner:request' };
  const { useRequestDetailExit } = loader({ react: hooks.react, 'react-native': { Platform: { OS: platform } } })('hooks/request-detail/useRequestDetailExit.ts');
  return { hooks, state, routes, router, render: () => hooks.render(() => useRequestDetailExit(router, state.active, state.scope)) };
}
test('request map is released before returning Home, and repeated taps schedule only one navigation', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const [platform, delay] of [['android', 40], ['ios', 260]]) {
    const app = fixture(platform), exit = app.render();
    exit.goHome(); exit.goHome();
    assert.equal(app.render().leaving, true); assert.deepEqual(app.routes, []);
    t.mock.timers.tick(delay); assert.deepEqual(app.routes, ['/(tabs)']); app.hooks.unmount();
  }
});
test('blur, account/request change or unmount cancel a pending Home exit', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  for (const change of ['blur', 'scope', 'unmount']) {
    const app = fixture('ios'); const exit = app.render(); exit.goHome();
    if (change === 'blur') { app.state.active = false; app.render(); }
    if (change === 'scope') { app.state.scope = 'other:request'; app.render(); exit.goHome(); }
    if (change === 'unmount') app.hooks.unmount();
    t.mock.timers.tick(500); assert.deepEqual(app.routes, []); app.hooks.unmount();
  }
});
test('a failed route replacement is contained and Home can be retried', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const app = fixture('android');
  app.router.replace = () => { throw new Error('not ready'); };
  app.render().goHome(); t.mock.timers.tick(40);
  assert.equal(app.render().leaving, false);
  app.router.replace = route => app.routes.push(route);
  app.render().goHome(); t.mock.timers.tick(40);
  assert.deepEqual(app.routes, ['/(tabs)']); app.hooks.unmount();
});
