const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { createRideOverlayStore } = loader()('features/navigation/rideOverlayStore.ts');

test('only one panel receives input; SOS preempts payment, nested panels resume and cleanup releases input', () => {
  const store = createRideOverlayStore(); store.setScope('passenger:a', true);
  const put = (id, priority, scope = 'passenger:a') => store.put({ id, priority, scope, children: id });
  put('pickup', 30); put('payment', 70, 'global'); put('sos', 100);
  assert.equal(store.getActive().id, 'sos');
  assert.equal(store.getEntries().length, 3, 'suspended content stays mounted without being interactive');
  store.remove('sos'); assert.equal(store.getActive().id, 'payment');
  store.setScope('passenger:a', false);
  assert.equal(store.getActive().id, 'payment', 'returning home never strands an invisible payment blocker');
  store.remove('payment'); assert.equal(store.getActive(), null); assert.equal(store.getEntries().length, 0);
  store.setScope('driver:b', true); put('security', 30, 'driver:b'); put('add-contact', 30, 'driver:b');
  assert.equal(store.getActive().id, 'add-contact'); store.remove('add-contact'); assert.equal(store.getActive().id, 'security');
});

test('repeated foreground cycles retain no stale panels, notices or native blockers', () => {
  const store = createRideOverlayStore();
  for (let i = 0; i < 500; i++) {
    store.setScope('driver:t', true);
    store.put({ id: 'panel', scope: 'driver:t', priority: 30, children: i });
    store.showNotice('driver:t', { title: 'Info', expiresAt: i + 1000 });
    store.blockNative('native', true); assert.equal(store.getActive(), null);
    store.blockNative('native', false); assert.equal(store.getActive().id, 'panel');
    store.setScope('driver:t', false);
    assert.equal(store.getActive(), null); assert.equal(store.getNotice('driver:t'), null); assert.equal(store.getEntries().length, 0);
  }
});

function modalFixture(os = 'ios') {
  const hooks = hookHarness('modal');
  const react = { ...hooks.react, createContext: value => ({ value }), useContext: context => context.value,
    useSyncExternalStore: (_subscribe, snapshot) => snapshot() };
  const load = loader({ react, 'react-native': { Platform: { OS: os }, Modal: 'NativeModal' } });
  const { RideOverlayContext, RideOverlayScopeContext } = load('features/navigation/rideOverlayContext.ts');
  const { RideModal } = load('features/navigation/RideModal.tsx');
  const store = createRideOverlayStore(); RideOverlayContext.value = store;
  return { store, hooks, scope: RideOverlayScopeContext, render: props => hooks.render(() => RideModal(props)) };
}

for (const os of ['ios', 'android']) test(`${os}: navigation panels never present a native modal and logical dismissal fires once`, () => {
  const env = modalFixture(os); let closed = 0;
  env.store.setScope('passenger:a', true); env.scope.value = { key: 'passenger:a', active: true };
  const props = { visible: true, children: 'payment', onDismiss: () => { closed++; } };
  assert.equal(env.render(props), null); assert.equal(env.store.getActive().children, 'payment');
  env.render({ ...props, visible: false }); env.render({ ...props, visible: false });
  assert.equal(closed, 1); assert.equal(env.store.getActive(), null);
  env.render(props); env.hooks.unmount(); assert.equal(env.store.getActive(), null);
});

test('outside navigation existing native dismissal callbacks are preserved', () => {
  const env = modalFixture(); let closed = 0;
  const props = { visible: true, presentationStyle: 'pageSheet', onDismiss: () => { closed++; } };
  assert.equal(env.render(props).type, 'NativeModal');
  const hidden = env.render({ ...props, visible: false });
  assert.equal(closed, 0); hidden.props.onDismiss(); hidden.props.onDismiss();
  assert.equal(closed, 1); env.hooks.unmount();
});

test('normal native dismissal cancels the fallback unmount', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = modalFixture(); let dismissed = 0;
  const props = { visible: true, onDismiss: () => dismissed++ };
  env.render(props);
  env.render({ ...props, visible: false }).props.onDismiss();
  t.mock.timers.tick(3000);
  assert.equal(env.render({ ...props, visible: false }).type, 'NativeModal');
  assert.equal(dismissed, 1); assert.equal(env.store.isBusy(), false);
  env.hooks.unmount();
});

test('global arrival payment remains in-app on Home and cannot leave a native controller behind', () => {
  const env = modalFixture(); const props = { visible: true, inApp: true, children: 'payment' };
  assert.equal(env.render(props), null); assert.equal(env.store.getActive().scope, 'global');
  env.render({ ...props, visible: false }); assert.equal(env.store.getActive(), null); env.hooks.unmount();
});

test('global driver payment is in-app, so a confirmation cannot request a second UIKit controller', () => {
  const fs = require('node:fs');
  const source = fs.readFileSync('components/DriverPaymentNoticeCoordinator.tsx', 'utf8');
  assert.match(source, /<Modal\s+inApp/);
  assert.doesNotMatch(source, /runAfterInteractions/);
  const env = modalFixture();
  env.render({ visible: true, inApp: true, children: 'driver-payment' });
  env.store.blockNative('dialog', true);
  assert.equal(env.store.getActive(), null);
  assert.equal(env.store.getEntries().length, 1, 'payment state is retained while confirmation is shown');
  env.store.blockNative('dialog', false);
  assert.equal(env.store.getActive().children, 'driver-payment');
  env.hooks.unmount();
});

test('iOS missing onDismiss removes the native element before releasing the overlay blocker; once only', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = modalFixture(); let dismissed = 0;
  const props = { visible: true, onDismiss: () => dismissed++ };
  env.render(props);
  const hidden = env.render({ ...props, visible: false });
  assert.equal(env.store.isBusy(), true);
  t.mock.timers.tick(2000);
  assert.equal(env.render({ ...props, visible: false }), null);
  assert.equal(env.store.isBusy(), false);
  assert.equal(dismissed, 1);
  hidden.props.onDismiss(); assert.equal(dismissed, 1);
  env.hooks.unmount();
});

test('reopening or unmounting cancels dismissal recovery and ignores an old native close callback', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = modalFixture(); let dismissed = 0;
  const props = { visible: true, onDismiss: () => dismissed++ };
  env.render(props);
  const hidden = env.render({ ...props, visible: false });
  env.render(props); hidden.props.onDismiss();
  t.mock.timers.tick(5000);
  assert.equal(env.render(props).props.visible, true);
  assert.equal(dismissed, 0);
  env.render({ ...props, visible: false }); env.hooks.unmount();
  t.mock.timers.tick(5000); assert.equal(dismissed, 0); assert.equal(env.store.isBusy(), false);
});
