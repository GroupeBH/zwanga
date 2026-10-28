const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const driverId = '00000000-0000-4000-8000-000000000001';
const id = '00000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-000000000003';
const push = (kind = 'dispatch') => ({
  driverId, actionProtocol: 'driver-v1',
  type: kind === 'booking' ? 'new_booking' : kind === 'nearby' ? 'trip_request_nearby' : 'driver_dispatch_offer',
  bookingId: id, offerId: id, tripRequestId: requestId, ringAlert: 'nearby-request-v1', delivery: 'driver-phone-v3',
  expiresAt: new Date(Date.now() + 30000).toISOString(), ringUntil: new Date(Date.now() + 30000).toISOString(),
});

test('notification card shows destination, seats and explicit budget/fare, never a guessed zero', () => {
  const { driverNotificationCard: card } = loader()('features/notifications/driverNotificationCard.ts');
  const data = { rideDeparture: 'Place centrale', rideArrival: 'Gare', rideSeats: '2', ridePricePerSeat: '2500.50', ridePriceKind: 'budget' };
  const view = card('dispatch', data);
  assert.match(view.title.replace(/[\u202f\u00a0]/g, ' '), /^Zwanga · Budget : 2 500,5 FC \/ place$/);
  assert.equal(card('booking', {}).title, 'Zwanga · Nouvelle réservation');
  assert.match(view.body, /Ouvrez Zwanga pour répondre\.$/);
  assert.match(view.body.replace(/[\u202f\u00a0]/g, ' '), /Budget : 2 500,5 FC \/ place/);
  assert.match(view.body, /Place centrale → Gare\n2 places/);
  assert.match(card('booking', { ...data, ridePricePerSeat: '0', ridePriceKind: 'fare' }).body, /^Gratuit/);
  for (const value of [undefined, null, '', ' ', '-2', 'NaN', '1e3', '<b>2000</b>']) {
    assert.doesNotMatch(card('booking', { ...data, ridePricePerSeat: value }).body, /FC|Gratuit/);
  }
  assert.match(card('booking', { rideArrival: 'Gare' }).body, /Destination : Gare/);
  assert.doesNotMatch(card('booking', { ridePricePerSeat: '1000' }).body, /FC/);
  assert.match(card('nearby', { ...data, rideDepartureAt: '2026-10-21T09:00:00.000Z' }).body, /21\/10.*10:00/);
  const old = card('dispatch', { invitationText: 'Place → Gare · 2500 FC/place · Accepter ou refuser ?' });
  assert.match(old.body, /2500 FC\/place/);
  const hostile = card('booking', { rideArrival: '<b>Gare</b>\n'.repeat(100), invitationText: '<b>Texte</b>'.repeat(1000) });
  assert.doesNotMatch(hostile.body, /<b>/); assert.ok(hostile.body.length <= 1000);
});

test('both actions open the app; nearby/shared requests do not pretend to be exclusive dispatch offers', () => {
  const { driverNotificationActions: actions } = loader()('features/notifications/driverNotificationCard.ts');
  for (const kind of ['booking', 'dispatch', 'nearby']) {
    const buttons = actions(kind, {});
    assert.deepEqual(buttons.map(b => b.title), ['Refuser', 'Accepter']);
    assert.ok(buttons.every(b => b.pressAction.launchActivity === 'default'));
  }
  assert.deepEqual(actions('nearby', {}).map(b => b.pressAction.id), ['driver-ignore-nearby', 'driver-review-nearby']);
  assert.equal(actions('nearby', { sharedTrip: 'true' })[1].title, 'Voir la demande');
});

function app(options = {}) {
  const hooks = hookHarness();
  const io = { owner: driverId, version: 1, state: 'active', routes: [], mutations: [], dismissed: [], displayed: [], handoffs: [],
    perform: async () => ({ status: 'accepted', requestId }), initial: null, ...options };
  const nativeListeners = new Set(), stateListeners = new Set();
  let background;
  const router = { navigate: value => io.routes.push(value) };
  const load = loader({
    react: hooks.react, 'expo-router': { useRouter: () => router },
    './useRideRealtime': { useRideRealtime() {} },
    '@/services/iosFirebaseMessaging': { subscribeIosFirebaseMessages: () => () => {} },
    'react-native': { Platform: { OS: 'android' }, Linking: { openURL: async () => assert.fail('native action launchActivity opens the app') },
      AppState: { get currentState() { return io.state; }, addEventListener: (_event, callback) => {
        stateListeners.add(callback); return { remove: () => stateListeners.delete(callback) };
      } } },
    '@notifee/react-native': { __esModule: true, default: {
      onForegroundEvent: callback => { nativeListeners.add(callback); return () => nativeListeners.delete(callback); },
      onBackgroundEvent: callback => { background = callback; },
      getInitialNotification: async () => io.initial,
      createChannel: async () => {}, displayNotification: async value => io.displayed.push(value),
    }, AndroidImportance: { LOW: 2 }, AndroidVisibility: { PRIVATE: 0 }, EventType: { PRESS: 1, ACTION_PRESS: 2, DELIVERED: 3 } },
    'expo-notifications': { addNotificationReceivedListener: () => ({ remove() {} }),
      addNotificationResponseReceivedListener: () => ({ remove() {} }), getLastNotificationResponseAsync: async () => null },
    '@/services/driverNotifications': { configureDriverNotifications: async () => {}, displayDriverInvitation: async data => io.handoffs.push(data) },
    '@/services/tokenSession': { getTokenSessionVersion: () => io.version },
    './driverNotifications': { dismissDriverInvitation: async v => io.dismissed.push(v) },
    './tokenStorage': { getTokens: async () => ({ accessToken: 'synthetic' }) },
    './tokenSession': { getTokenSessionVersion: () => io.version },
    '@/utils/jwt': { decodeJWT: () => ({ sub: io.owner }), getUserIdFromToken: () => io.owner },
    './ongoingTripNotification': { ONGOING_TRIP_NOTIFICATION_ID: 'ongoing' },
    '@/store': { store: { dispatch: request => {
      if (request.type) return request;
      io.mutations.push(request); return { unwrap: () => io.perform(request), reset() {} };
    } } },
    '@/store/api/driverDispatchApi': { driverDispatchApi: { endpoints: {
      respondToDispatchOffer: { initiate: body => ({ kind: 'dispatch', body }) },
      respondToBookingInvitation: { initiate: body => ({ kind: 'booking', body }) },
      declineNearbyRequest: { initiate: id => ({ kind: 'nearby-refusal', id }) },
    } } },
  });
  load('services/notifeeBackgroundHandler.ts');
  const hook = load('hooks/notifications/useDriverNotifications.ts').useDriverNotifications;
  const event = (data, action) => ({ type: 2, detail: { notification: { data }, pressAction: { id: action } } });
  return { io, load, hooks, mount: () => hooks.render(() => hook(driverId, true)),
    foreground: (data, action) => { for (const listener of nativeListeners) listener(event(data, action)); },
    body: data => { for (const listener of nativeListeners) listener({ ...event(data, 'default'), type: 1 }); },
    delivered: data => { for (const listener of nativeListeners) listener({ ...event(data, 'default'), type: 3 }); },
    background: (data, action) => background(event(data, action)),
    backgroundBody: data => background({ ...event(data, 'default'), type: 1 }),
    resume: () => { io.state = 'active'; for (const listener of stateListeners) listener('active'); },
  };
}

test('a native card delivered after entry enumeration transfers audio without another unlock or a decision', async () => {
  const f = app(); f.mount(); await tick();
  const data = { ...push('booking'), nativeAlert: 'driver-v6' };
  f.delivered(data); await tick();
  assert.deepEqual(f.io.handoffs, [data]); assert.equal(f.io.mutations.length, 0);
  f.io.state = 'background'; f.delivered(data); await tick(); assert.equal(f.io.handoffs.length, 1);
  f.io.state = 'active'; f.io.version++; f.delivered(data); await tick(); assert.equal(f.io.handoffs.length, 1);
  f.hooks.unmount();
});

test('nearby body taps before profile hydration open that request once, without an accept/refuse mutation', async () => {
  for (const delivery of ['driver-phone-v3', undefined]) {
    const data = { ...push('nearby'), delivery };
    const f = app({ initial: { notification: { data }, pressAction: { id: 'default' } } });
    f.body(data); // Only the root listener exists; profile/navigation hook not mounted.
    assert.deepEqual(f.io.routes, []);
    f.mount(); await tick();
    assert.deepEqual(f.io.routes, [{ pathname: '/request-details/[id]', params: { id: requestId } }]);
    assert.equal(f.io.mutations.length, 0);
    f.hooks.unmount();
  }
});

test('a new body tap reopens the same invitation after returning Home, without replaying a decision', async () => {
  for (const kind of ['nearby', 'dispatch', 'booking']) {
    const f = app(); f.mount(); await tick();
    f.body(push(kind)); await tick();
    f.body(push(kind)); await tick();
    assert.equal(f.io.routes.length, 2, kind);
    assert.equal(f.io.mutations.length, 0);
    assert.equal(f.io.dismissed.length, 0, 'opening is not an answer');
    f.hooks.unmount();
  }
});

test('a delayed background body tap after resume is consumed without a second app opening or mutation', async () => {
  for (const kind of ['nearby', 'dispatch', 'booking']) {
    const f = app(); f.mount(); await tick();
    // Reproduce OS ordering: AppState active first, headless PRESS afterwards.
    // Linking is intentionally unavailable; the mounted coordinator must route.
    await f.backgroundBody(push(kind)); await tick();
    assert.equal(f.io.routes.length, 1, kind);
    assert.equal(f.io.mutations.length, 0);
    f.resume(); await tick(); assert.equal(f.io.routes.length, 1);
    f.hooks.unmount();
  }
});

test('a foreground action received by both native listeners mutates and opens its details only once', async () => {
  for (const kind of ['dispatch', 'booking']) {
    for (const action of ['driver-accept', 'driver-decline']) {
      const f = app(); f.mount(); await tick();
      f.foreground(push(kind), action); await tick(); await tick();
      assert.equal(f.io.mutations.length, 1);
      assert.equal(f.io.routes.length, 1);
      assert.deepEqual(f.io.routes[0], kind === 'dispatch' && action === 'driver-decline'
        ? { pathname: '/(tabs)', params: {} } : { pathname: '/incoming-driver', params: { kind, id, driverId } });
      assert.equal(f.io.dismissed.length, 1);
      assert.equal(f.io.displayed[0].title, 'Réponse enregistrée');
      f.hooks.unmount();
    }
  }
});

test('a headless action opens on hydration; the initial-notification copy neither repeats the mutation nor the route', async () => {
  for (const action of ['driver-accept', 'driver-decline']) {
    const data = push();
    const f = app({ state: 'background', initial: { notification: { data }, pressAction: { id: action } } });
    await f.background(data, action);
    assert.equal(f.io.mutations.length, 1); assert.equal(f.io.routes.length, 0);
    f.resume(); f.mount(); await tick();
    assert.equal(f.io.mutations.length, 1); assert.equal(f.io.routes.length, 1);
    f.hooks.unmount();
  }
});

test('a background action in an already mounted app waits for foreground before routing', async () => {
  const f = app(); f.mount(); await tick(); f.io.state = 'background';
  await f.background(push('booking'), 'driver-decline');
  assert.equal(f.io.routes.length, 0);
  f.resume(); await tick(); assert.equal(f.io.routes.length, 1);
  f.resume(); await tick(); assert.equal(f.io.routes.length, 1);
  f.hooks.unmount();
});

test('old initial actions are read-only and do not restart the alert or send a decision', async () => {
  const data = { ...push(), expiresAt: new Date(0).toISOString() };
  const f = app({ initial: { notification: { data }, pressAction: { id: 'driver-accept' } } });
  f.mount(); await tick();
  assert.equal(f.io.mutations.length, 0); assert.equal(f.io.routes.length, 1);
  assert.equal(f.io.dismissed.length, 0); f.hooks.unmount();
});

test('expired and uncertain answers open details for reconciliation without claiming success; deliberate retry is allowed', async () => {
  const expired = app(); expired.mount(); await tick();
  expired.foreground({ ...push(), expiresAt: new Date(0).toISOString() }, 'driver-accept');
  await tick(); await tick();
  assert.equal(expired.io.mutations.length, 0); assert.equal(expired.io.routes.length, 1);
  assert.equal(expired.io.displayed[0].title, 'Réponse à vérifier'); expired.hooks.unmount();
  const f = app({ perform: async () => { throw { status: 'FETCH_ERROR' }; } });
  f.mount(); await tick(); f.foreground(push(), 'driver-accept'); await tick(); await tick();
  assert.equal(f.io.mutations.length, 1); assert.equal(f.io.routes.length, 1);
  assert.equal(f.io.displayed[0].title, 'Réponse à vérifier');
  f.foreground(push(), 'driver-accept'); await tick(); await tick();
  assert.equal(f.io.mutations.length, 2); assert.equal(f.io.routes.length, 2);
  f.hooks.unmount();
});

test('wrong account and a changed session cannot answer, dismiss another driver or force a route', async () => {
  const wrong = app({ owner: 'other' }); wrong.mount(); await tick();
  wrong.foreground(push(), 'driver-accept'); await tick();
  assert.equal(wrong.io.mutations.length, 0); assert.equal(wrong.io.routes.length, 0);
  assert.equal(wrong.io.dismissed.length, 0); wrong.hooks.unmount();
  let finish;
  const f = app({ perform: () => new Promise(resolve => { finish = resolve; }) });
  f.mount(); await tick(); f.foreground(push(), 'driver-accept'); await tick();
  f.io.version++; finish({ status: 'accepted', requestId }); await tick(); await tick();
  assert.equal(f.io.routes.length, 0); assert.equal(f.io.displayed.length, 0); f.hooks.unmount();
});

test('nearby actions open the request, report refusal to the server and never pick a vehicle or bypass passenger consent', async () => {
  for (const action of ['driver-ignore-nearby', 'driver-review-nearby']) {
    for (const mode of ['foreground', 'background']) {
      const f = app(); f.mount(); await tick();
      const data = { ...push('nearby'), sharedTrip: 'true' };
      if (mode === 'foreground') f.foreground(data, action);
      else { f.io.state = 'background'; await f.background(data, action); f.resume(); }
      await tick(); await tick();
      assert.deepEqual(f.io.routes, [action === 'driver-ignore-nearby' ? { pathname: '/(tabs)', params: {} }
        : { pathname: '/request-details/[id]', params: { id: requestId } }]);
      assert.deepEqual(f.io.mutations, action === 'driver-ignore-nearby' ? [{ kind: 'nearby-refusal', id: requestId }] : []);
      assert.equal(f.io.dismissed.length, action === 'driver-ignore-nearby' ? 1 : 0);
      f.hooks.unmount();
    }
  }
});

test('a new deliberate nearby Accept tap opens again, while concurrent native events coalesce', async () => {
  const f = app(); f.mount(); await tick();
  const data = push('nearby');
  f.foreground(data, 'driver-review-nearby');
  await tick(); await tick();
  assert.equal(f.io.routes.length, 1);
  // Back without confirming the vehicle, then tap the same notification again.
  f.foreground(data, 'driver-review-nearby');
  await tick(); await tick();
  assert.equal(f.io.routes.length, 2);
  assert.equal(f.io.mutations.length, 0);
  assert.equal(f.io.dismissed.length, 0);
  f.hooks.unmount();
});


test('a failed nearby refusal opens a retryable detail and does not dismiss the invitation', async () => {
  const f = app({ perform: async () => { throw Error('offline'); } }); f.mount(); await tick();
  f.foreground(push('nearby'), 'driver-ignore-nearby'); await tick(); await tick();
  assert.deepEqual(f.io.routes, [{ pathname: '/request-details/[id]', params: { id: requestId } }]);
  assert.equal(f.io.dismissed.length, 0); f.hooks.unmount();
});
