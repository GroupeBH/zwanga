const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const driverId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const invitation = { kind: 'dispatch', id, driverId };
const tick = () => new Promise(resolve => setImmediate(resolve));

function app({ owner = driverId, perform = async () => {}, tokens } = {}) {
  const mutations = [], displays = [], dismissals = [], resets = [];
  let session = 1;
  const respond = loader({
    'react-native': { Platform: { OS: 'android' } },
    '@notifee/react-native': { __esModule: true, default: {
      createChannel: async () => {}, displayNotification: async value => displays.push(value),
    }, AndroidImportance: { LOW: 2 }, AndroidVisibility: { PRIVATE: 0 } },
    './tokenStorage': { getTokens: tokens ?? (async () => ({ accessToken: 'test' })) },
    './tokenSession': { getTokenSessionVersion: () => session },
    '@/utils/jwt': { decodeJWT: () => ({ sub: owner }) },
    './driverNotifications': { dismissDriverInvitation: async value => dismissals.push(value) },
    '@/store': { store: { dispatch: request => {
      mutations.push(request); return { unwrap: () => perform(request), reset: () => resets.push(request) };
    } } },
    '@/store/api/driverDispatchApi': { driverDispatchApi: { endpoints: {
      respondToDispatchOffer: { initiate: body => ({ kind: 'dispatch', body }) },
      respondToBookingInvitation: { initiate: body => ({ kind: 'booking', body }) },
    } } },
  })('services/driverNotificationResponse.ts').respondToDriverNotification;
  return { respond, mutations, displays, dismissals, resets, changeSession: () => { session++; } };
}

test('notification actions use authenticated endpoints directly, once, without a screen', async () => {
  let finish;
  const view = app({ perform: () => new Promise(resolve => { finish = resolve; }) });
  const first = view.respond(invitation, 'driver-accept');
  const second = view.respond(invitation, 'driver-decline');
  await tick();
  assert.deepEqual(view.mutations, [{ kind: 'dispatch', body: { id, decision: 'accept' } }]);
  assert.equal(view.displays.length, 0);
  finish(); await Promise.all([first, second]);
  await view.respond(invitation, 'driver-accept');
  assert.equal(view.mutations.length, 1);
  assert.equal(view.resets.length, 1);
  assert.equal(view.displays[0].title, 'Réponse enregistrée');
  assert.equal(view.displays[0].ios.foregroundPresentationOptions.sound, false);
  assert.equal(view.displays[0].android.importance, 2);
});

test('published booking refusal uses its dedicated endpoint; receipt/body tap never responds', async () => {
  const view = app();
  for (const action of [undefined, 'default', 'driver_action_result', 'bad']) await view.respond(invitation, action);
  assert.deepEqual(view.mutations, []);
  await view.respond({ ...invitation, kind: 'booking' }, 'driver-decline');
  assert.deepEqual(view.mutations, [{ kind: 'booking', body: { id, accept: false } }]);
});

test('server conflict or network failure is not presented as success or queued for replay', async () => {
  const view = app({ perform: async () => { throw { status: 409 }; } });
  await view.respond(invitation, 'driver-accept');
  assert.equal(view.displays[0].title, 'Réponse à vérifier');
  assert.match(view.displays[0].body, /n’est pas confirmée/);
  assert.equal(view.mutations.length, 1);
  assert.equal(view.resets.length, 1);
  // A deliberate fresh tap may retry; nothing happens automatically in between.
  await view.respond(invitation, 'driver-accept');
  assert.equal(view.mutations.length, 2);
});

test('wrong recipient and a session changed while reading credentials cannot mutate', async () => {
  const wrong = app({ owner: 'someone-else' });
  await wrong.respond(invitation, 'driver-accept');
  assert.deepEqual(wrong.mutations, []);
  let finish;
  const changed = app({ tokens: () => new Promise(resolve => { finish = resolve; }) });
  const pending = changed.respond(invitation, 'driver-accept'); await tick();
  changed.changeSession(); finish({ accessToken: 'test' }); await pending;
  assert.deepEqual(changed.mutations, []);
  assert.deepEqual(changed.displays, []);
});

test('result payload opens its details only on tap, never on delivery or as an action', async () => {
  const hooks = hookHarness(), routes = [], actions = [];
  let native;
  const result = { type: 'driver_action_result', ...invitation };
  const load = loader({ react: hooks.react,
    'expo-router': { useRouter: () => ({ navigate: path => routes.push(path) }) },
    'react-native': { AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) }, Platform: { OS: 'android' } },
    'expo-notifications': { addNotificationReceivedListener: () => ({ remove() {} }),
      addNotificationResponseReceivedListener: () => ({ remove() {} }), getLastNotificationResponseAsync: async () => null },
    '@notifee/react-native': { __esModule: true, default: {
      onForegroundEvent: callback => { native = callback; return () => {}; }, getInitialNotification: async () => null,
    }, EventType: { DELIVERED: 3, PRESS: 1, ACTION_PRESS: 2 } },
    '@/services/driverNotifications': { configureDriverNotifications: async () => {}, displayDriverInvitation: async () => {}, silenceDriverInvitations: async () => {} },
    '@/services/driverNotificationResponse': { respondToDriverNotification: async (...args) => actions.push(args) },
  });
  const useNotifications = load('hooks/notifications/useDriverNotifications.ts').useDriverNotifications;
  hooks.render(() => useNotifications(driverId));
  native({ type: 3, detail: { notification: { data: result } } }); await tick();
  assert.deepEqual(routes, []);
  native({ type: 1, detail: { notification: { data: result }, pressAction: { id: 'default' } } }); await tick();
  assert.deepEqual(routes, [{ pathname: '/incoming-driver', params: { kind: 'dispatch', id, driverId } }]);
  assert.deepEqual(actions, []);
  const policy = load('features/notifications/driverInvitation.ts');
  assert.equal(policy.parseDriverInvitation(result), null);
  assert.equal(policy.parseDriverResponseResult({ ...result, id: '../auth' }), null);
  hooks.unmount();
});

test('cold-start iOS body taps survive profile hydration, once and only for their recipient', () => {
  const pending = loader()('features/notifications/pendingDriverOpen.ts');
  const result = { type: 'driver_action_result', ...invitation };
  pending.rememberPendingDriverOpen(result);
  assert.deepEqual(pending.takePendingDriverOpen(driverId), result);
  assert.equal(pending.takePendingDriverOpen(driverId), undefined);
  pending.rememberPendingDriverOpen(result);
  assert.equal(pending.takePendingDriverOpen('another-user'), undefined);
  assert.equal(pending.takePendingDriverOpen(driverId), undefined);
  pending.rememberPendingDriverOpen({ type: 'message', driverId });
  assert.equal(pending.takePendingDriverOpen(driverId), undefined);
});

test('cold start and every foreground return silence invitations without sending a decision', async () => {
  const hooks = hookHarness(), silenced = [], mutations = [], routes = [];
  let onState; let removed = false;
  const router = { navigate: path => routes.push(path) };
  const load = loader({ react: hooks.react,
    'expo-router': { useRouter: () => router },
    'react-native': { Platform: { OS: 'ios' }, AppState: { currentState: 'active',
      addEventListener: (_event, handler) => { onState = handler; return { remove: () => { removed = true; } }; } } },
    'expo-notifications': { addNotificationReceivedListener: () => ({ remove() {} }),
      addNotificationResponseReceivedListener: () => ({ remove() {} }), getLastNotificationResponseAsync: async () => null },
    '@notifee/react-native': { __esModule: true, default: { onForegroundEvent: () => () => {} }, EventType: {} },
    '@/services/driverNotifications': { configureDriverNotifications: async () => {}, displayDriverInvitation: async () => {},
      silenceDriverInvitations: async userId => silenced.push(userId) },
    '@/services/driverNotificationResponse': { respondToDriverNotification: async value => mutations.push(value) },
  });
  const useNotifications = load('hooks/notifications/useDriverNotifications.ts').useDriverNotifications;
  hooks.render(() => useNotifications(driverId)); await tick();
  assert.deepEqual(silenced, [driverId]);
  onState('background'); onState('inactive'); await tick();
  assert.equal(silenced.length, 1);
  onState('active'); await tick();
  assert.deepEqual(silenced, [driverId, driverId]);
  assert.deepEqual(mutations, []);
  assert.deepEqual(routes, []);
  hooks.unmount(); assert.equal(removed, true);
});
