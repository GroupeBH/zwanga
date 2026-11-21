const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const hooks = hookHarness();
  const env = { userId: 'driver', active: true, ready: true, online: true, onHome: true, profileFailed: false, version: 1 };
  const { useHomePreparation } = loader({ react: hooks.react,
    '@/services/tokenSession': { getTokenSessionVersion: () => env.version },
  })('hooks/navigation/useHomePreparation.ts');
  t.after(() => hooks.unmount());
  return { env, hooks, render: () => hooks.render(() => useHomePreparation(env)) };
}

test('Home waits for its first useful layout/data then never reloads on refresh or foreground return', t => {
  const f = fixture(t);
  assert.equal(f.render().pending, true);
  t.mock.timers.tick(2000); assert.equal(f.render().pending, true, 'not just the ride verification budget');
  f.render().reportPrepared(); assert.equal(f.render().pending, false);
  for (let i = 0; i < 20; i++) {
    f.env.active = false; assert.equal(f.render().pending, false);
    f.env.active = true; assert.equal(f.render().pending, false);
    f.render().reportPrepared();
  }
});

test('slow requests cannot hold the cover longer than eight seconds or restart it on retry', t => {
  const f = fixture(t); f.render();
  t.mock.timers.tick(7999); assert.equal(f.render().pending, true);
  t.mock.timers.tick(1); assert.equal(f.render().pending, false);
  f.env.online = false; f.render(); f.env.online = true;
  assert.equal(f.render().pending, false);
});

for (const key of ['online', 'profileFailed', 'onHome']) {
  test(`${key}: failure or a priority destination releases preparation without GPS or tile readiness`, t => {
    const f = fixture(t); f.render();
    f.env[key] = key === 'profileFailed';
    assert.equal(f.render().pending, false);
    f.env[key] = key !== 'profileFailed';
    assert.equal(f.render().pending, false, 'recovery cannot cover a previously revealed screen');
  });
}

test('startup and inactive time do not start a new preparation budget', t => {
  const f = fixture(t); f.env.ready = false;
  assert.equal(f.render().pending, false); t.mock.timers.tick(20000);
  f.env.ready = true; assert.equal(f.render().pending, true);
  t.mock.timers.tick(3000); f.env.active = false; assert.equal(f.render().pending, false);
  t.mock.timers.tick(4000); f.env.active = true; assert.equal(f.render().pending, true);
  t.mock.timers.tick(1000); assert.equal(f.render().pending, false, 'same eight-second wall-clock budget');
});

test('old layout callbacks cannot prepare a different account or session', t => {
  const f = fixture(t), first = f.render();
  f.env.userId = 'passenger'; assert.equal(f.render().pending, true);
  first.reportPrepared(); assert.equal(f.render().pending, true);
  const second = f.render(); f.env.version++; assert.equal(f.render().pending, true);
  second.reportPrepared(); assert.equal(f.render().pending, true);
  f.env.active = false; f.render().reportPrepared(); f.env.active = true;
  assert.equal(f.render().pending, true);
  f.render().reportPrepared(); assert.equal(f.render().pending, false);
});

test('signed-out entry never starts or holds a home preparation cover', t => {
  const f = fixture(t); f.env.userId = undefined;
  assert.equal(f.render().pending, false);
  f.env.userId = 'driver'; assert.equal(f.render().pending, true);
  f.env.userId = undefined; assert.equal(f.render().pending, false);
});
