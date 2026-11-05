const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree)
  ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree)
  ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');
const tap = tree => nodes(tree).find(node => node.type === 'Pressable').props.onPress;
const alert = patch => ({ key: 'driver-booking-booking', id: 'booking', kind: 'booking', recipientId: 'driver',
  data: { type: 'new_booking', rideDeparture: 'Point A', rideArrival: 'Point B', passengerId: 'passenger' }, ...patch });
function fixture(t) {
  const hooks = hookHarness(), routes = [], dismissals = [], reads = [];
  const props = { userId: 'driver', visible: true, path: '/', alerts: [alert()] };
  const env = { version: 0, online: true, query: { isFetching: false, isError: false } };
  const { DriverBookingAlertBanner } = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Pressable: 'Pressable', Text: 'Text', StyleSheet: { create: s => s } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24 }) },
    'expo-router': { useRouter: () => ({ navigate: route => routes.push(route) }) },
    '@/store/hooks': { useAppSelector: selector => selector({ zwangaApi: { config: { online: env.online } } }) },
    '@/store/api/bookingApi': { useGetBookingByIdQuery: (id, options) => { reads.push({ id, options }); return env.query; } },
    '@/services/tokenSession': { getTokenSessionVersion: () => env.version },
    '@/services/driverNotifications': { dismissDriverInvitation: async input => { dismissals.push(input); } },
    '@/services/rideAudioDiagnostics': { reportRideAudioFailure() {} },
  })('components/DriverBookingAlertBanner.tsx');
  t.after(() => hooks.unmount());
  return { hooks, props, env, reads, routes, dismissals, render: () => hooks.render(() => DriverBookingAlertBanner(props)) };
}

test('booking identity and route remain visible beyond the ringtone and unrelated notification updates', t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture(t);
  assert.match(words(f.render()), /ZWANGA.*NOUVELLE RÉSERVATION.*Point A → Point B.*Voir la réservation/);
  t.mock.timers.tick(65000);
  f.props.alerts.push(alert({ id: 'request', key: 'nearby-request', kind: 'nearby' }));
  assert.match(words(f.render()), /Point A → Point B/);
  assert.equal(f.dismissals.length, 0, 'presentation or audio deadline never answers a booking');
});

test('tap opens validated read-only booking entry once, never accepts or silences the pending invitation', t => {
  const f = fixture(t), open = tap(f.render()); open(); open();
  assert.deepEqual(f.routes, [{ pathname: '/incoming-driver', params: { kind: 'booking', id: 'booking', driverId: 'driver' } }]);
  assert.deepEqual(f.dismissals, []);
});

test('persistent banner reserves layout space instead of covering Back or reservation action buttons', t => {
  const f = fixture(t), tree = f.render();
  assert.equal(tree.props.style[0].position, undefined);
  assert.equal(tree.props.style[1].paddingTop, 32);
});

test('offline/network failure keeps the entry visible and pauses polling instead of hiding the invitation', t => {
  const f = fixture(t); f.env.query = { isError: true, isFetching: false, error: { status: 503 } };
  assert.match(words(f.render()), /Réessayer/);
  assert.equal(f.reads.at(-1).options.pollingInterval, 15000);
  f.env.online = false;
  assert.match(words(f.render()), /NOUVELLE RÉSERVATION/);
  assert.equal(f.reads.at(-1).options.skip, true); assert.equal(f.reads.at(-1).options.pollingInterval, 0);
  f.props.visible = false; assert.equal(f.render(), null);
  assert.equal(f.reads.at(-1).options.skip, true); assert.deepEqual(f.dismissals, []);
});

test('accepted/rejected/cancelled/finished or foreign bookings dismiss only their matching sound/card once', t => {
  for (const patch of [{ status: 'accepted' }, { status: 'rejected' }, { status: 'cancelled' }, { droppedOff: true },
    { passengerId: 'driver' }, { trip: { id: 'trip', driverId: 'other', status: 'upcoming' } }]) {
    const f = fixture(t);
    f.env.query.currentData = { id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'pending', ...patch };
    assert.equal(f.render(), null); assert.equal(f.render(), null);
    assert.deepEqual(f.dismissals, [{ id: 'booking', kind: 'booking', driverId: 'driver' }]);
  }
});

test('deleted/private booking responses clear the persistent alert but a transient error does not', t => {
  for (const status of [403, 404, 410, 500, 'FETCH_ERROR']) {
    const f = fixture(t); f.env.query = { isError: true, isFetching: false, error: { status } };
    const terminal = [403, 404, 410].includes(status);
    assert.equal(f.render() === null, terminal); assert.equal(f.dismissals.length, terminal ? 1 : 0);
  }
});

test('old callbacks cannot navigate after background, account, session, screen change, replacement or unmount', t => {
  for (const change of ['hidden', 'account', 'session', 'path', 'replacement', 'unmount']) {
    const f = fixture(t), open = tap(f.render());
    if (change === 'hidden') f.props.visible = false;
    if (change === 'account') f.props.userId = 'other';
    if (change === 'session') f.env.version++;
    if (change === 'path') f.props.path = '/wallet';
    if (change === 'replacement') f.props.alerts = [alert({ id: 'next', key: 'driver-booking-next' })];
    if (change === 'unmount') f.hooks.unmount(); else f.render();
    open(); assert.deepEqual(f.routes, [], change);
  }
});

test('foreign, self, expired and non-booking alerts do not render or subscribe', t => {
  for (const patch of [{ recipientId: 'other' }, { data: { type: 'new_booking', passengerId: 'driver' } },
    { expiresAt: '2020-01-01T00:00:00Z' }, { kind: 'response' }]) {
    const f = fixture(t); f.props.alerts = [alert(patch)]; assert.equal(f.render(), null);
    assert.equal(f.reads.at(-1).options.skip, true); assert.deepEqual(f.dismissals, []);
  }
});

test('verified booking route fills sparse legacy push content without reading another booking snapshot', t => {
  const f = fixture(t); f.props.alerts = [alert({ data: { type: 'new_booking' } })];
  f.env.query.currentData = { id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'pending',
    trip: { id: 'trip', driverId: 'driver', status: 'upcoming', departure: { name: 'Lieu A' }, arrival: { name: 'Lieu B' } } };
  assert.match(words(f.render()), /Lieu A → Lieu B/);
  f.env.query.currentData.id = 'different';
  assert.doesNotMatch(words(f.render()), /Lieu A/);
});
