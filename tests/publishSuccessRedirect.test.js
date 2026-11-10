const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function setup() {
  const hooks = hookHarness(), tasks = [], routes = [];
  let session = 1, throws = false;
  const router = { replace: route => { if (throws) throw Error('navigation unavailable'); routes.push(route); } };
  const useRedirect = loader({ react: hooks.react,
    'react-native': { InteractionManager: { runAfterInteractions: callback => {
      const task = { callback, cancelled: false, cancel() { this.cancelled = true; } };
      tasks.push(task); return task;
    } } },
    '@/services/tokenSession': { getTokenSessionVersion: () => session },
  })('hooks/publish/usePublishSuccessRedirect.ts').usePublishSuccessRedirect;
  return { hooks, tasks, routes, render: (success, active = true) => hooks.render(() => useRedirect(success, active, router)),
    changeSession: () => session++, fail: value => { throws = value; } };
}

test('publication opens exactly the returned trip after interactions, without a confirmation click', () => {
  const env = setup(), success = { recurring: false, id: 'created-trip' };
  env.render(null); assert.equal(env.tasks.length, 0);
  env.render(success); assert.equal(env.routes.length, 0);
  env.tasks[0].callback(); env.render(success); env.tasks[0].callback();
  assert.deepEqual(env.routes, [{ pathname: '/trip/[id]', params: { id: 'created-trip' } }]);
  assert.equal(env.tasks.length, 1);
  env.hooks.unmount();
});

test('blur cancels pending redirect and resume schedules it once; unmount ignores a late callback', () => {
  const env = setup(), success = { recurring: false, id: 'created-trip' };
  env.render(success); env.render(success, false);
  assert.equal(env.tasks[0].cancelled, true);
  env.tasks[0].callback(); assert.equal(env.routes.length, 0);
  env.render(success); env.tasks[1].callback(); assert.equal(env.routes.length, 1);
  const disposed = setup(); disposed.render(success); disposed.hooks.unmount();
  disposed.tasks[0].callback(); assert.equal(disposed.routes.length, 0);
  env.hooks.unmount();
});

test('a change of account never opens the previous account publication', () => {
  const env = setup(), success = { recurring: false, id: 'previous-account-trip' };
  env.render(success); env.changeSession(); env.tasks[0].callback(); env.render(success);
  assert.equal(env.routes.length, 0); env.hooks.unmount();
});

test('template ids never open as trip ids; legacy success without id has a safe list fallback', () => {
  for (const [success, destination] of [
    [{ recurring: true, id: 'template-not-trip' }, '/recurring-trips'],
    [{ recurring: false }, '/trips'],
  ]) {
    const env = setup(); env.render(success); env.tasks[0].callback();
    assert.deepEqual(env.routes, [destination]); env.hooks.unmount();
  }
});

test('navigation failure offers a retry of navigation only, without another publication', () => {
  const env = setup(), success = { recurring: false, id: 'created-trip' };
  env.fail(true); env.render(success); env.tasks[0].callback();
  const current = env.render(success); assert.equal(current.failed, true);
  env.fail(false); current.retry(); assert.equal(env.render(success).failed, false);
  env.tasks[1].callback(); assert.deepEqual(env.routes, [{ pathname: '/trip/[id]', params: { id: 'created-trip' } }]);
  env.hooks.unmount();
});
