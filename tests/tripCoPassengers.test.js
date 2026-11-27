const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const trip = { id: 'trip', driverId: 'driver', status: 'upcoming' };
const booking = { id: 'own', tripId: 'trip', passengerId: 'viewer', status: 'accepted' };
const person = { id: 'other', userId: 'member', firstName: 'Exemple', avatarUrl: null, seats: 2 };
function model() {
  const harness = hookHarness();
  const state = { auth: { user: { id: 'viewer' } }, zwangaApi: { config: { online: true } } };
  const context = { session: 1, calls: [], read: { currentData: { tripId: 'trip', participants: [person] }, refetch: async () => ({}) } };
  const load = loader({ react: harness.react,
    '@/store/hooks': { useAppSelector: selector => selector(state) },
    '@/store/api/tripApi': { useGetTripCoPassengersQuery: (args, options) => { context.calls.push({ args, options }); return context.read; } },
    '@/services/tokenSession': { getTokenSessionVersion: () => context.session },
  });
  const module = load('hooks/trip-detail/useTripCoPassengers.ts');
  return { ...module, harness, state, context, render: (active = true, expanded = true, currentBooking = booking) =>
    harness.render(() => module.useTripCoPassengers(trip, currentBooking, active, expanded)) };
}

test('only a confirmed passenger of this published trip can see the section, independent of account role', () => {
  const { canSeeCoPassengers: allowed } = model();
  assert.equal(allowed(trip, booking, 'viewer'), true);
  assert.equal(allowed({ ...trip, status: 'completed' }, { ...booking, status: 'completed' }, 'viewer'), true);
  for (const status of ['pending', 'cancelled', 'rejected', 'no_show', 'expired']) {
    assert.equal(allowed(trip, { ...booking, status }, 'viewer'), false, status);
  }
  for (const changes of [{ driverId: 'viewer' }, { tripRequestId: 'request' }, { isPrivate: true }, { isExpired: true }, { status: 'cancelled' }]) {
    assert.equal(allowed({ ...trip, ...changes }, booking, 'viewer'), false);
  }
  assert.equal(allowed(trip, { ...booking, tripId: 'another' }, 'viewer'), false);
  assert.equal(allowed(trip, booking, 'stranger'), false);
  assert.equal(allowed(trip, null, 'viewer'), false);
  assert.equal(allowed(undefined, booking, 'viewer'), false);
  assert.equal(allowed(trip, booking, undefined), false);
});

test('reads are on-demand only, and hidden in background, offline or after losing eligibility', () => {
  const m = model();
  assert.equal(m.render(true, false).participants, undefined);
  assert.equal(m.context.calls.at(-1).options.skip, true);
  assert.deepEqual(m.render().participants, [person]);
  assert.equal(m.context.calls.at(-1).options.pollingInterval, 0);
  assert.equal(m.context.calls.at(-1).options.refetchOnMountOrArgChange, true);
  assert.equal(m.render(false).participants, undefined);
  m.state.zwangaApi.config.online = false;
  assert.equal(m.render().participants, undefined);
  assert.equal(m.context.calls.at(-1).options.skip, true);
  m.state.zwangaApi.config.online = true;
  assert.equal(m.render(true, true, { ...booking, status: 'cancelled' }).participants, undefined);
  m.harness.unmount();
});

test('permission rechecks, final denials and network failures never show stale identities', () => {
  const m = model();
  m.context.read.isFetching = true;
  assert.equal(m.render().participants, undefined);
  m.context.read.isFetching = false;
  for (const status of [401, 403, 404, 410, 500, 'FETCH_ERROR']) {
    m.context.read.error = { status }; m.context.read.isError = true;
    const result = m.render();
    assert.equal(result.participants, undefined);
    assert.equal(result.denied, [401, 403, 404, 410].includes(status));
  }
  m.context.read.isError = false; m.context.read.error = undefined;
  m.context.read.currentData = { tripId: 'another-trip', participants: [person] };
  assert.equal(m.render().participants, undefined);
  m.context.read.data = { tripId: 'trip', participants: [person] };
  m.context.read.currentData = undefined;
  assert.equal(m.render().participants, undefined); // RTK previous-argument data is not reused.
  m.harness.unmount();
});

test('account and token session isolate the query cache; no unmounted refresh', async () => {
  const m = model();
  let refreshes = 0; m.context.read.refetch = async () => { refreshes++; };
  const original = m.render();
  assert.deepEqual(m.context.calls.at(-1).args, { tripId: 'trip', viewerId: 'viewer', session: 1 });
  m.context.session = 2;
  await original.refresh();
  assert.equal(refreshes, 0);
  m.state.auth.user.id = 'second';
  const next = m.render(true, true, { ...booking, passengerId: 'second' });
  assert.deepEqual(m.context.calls.at(-1).args, { tripId: 'trip', viewerId: 'second', session: 2 });
  m.harness.unmount();
  await next.refresh();
  assert.equal(refreshes, 0);
});

test('endpoint sends no viewer impersonation parameter, keeps no unused cache and projects public fields only', () => {
  const { buildTripCoPassengers } = loader()('store/api/trip/coPassengers.ts');
  const endpoint = buildTripCoPassengers({ query: options => options }).getTripCoPassengers;
  assert.equal(endpoint.query({ tripId: 'trip', viewerId: 'viewer', session: 8 }), '/trips/trip/co-passengers');
  assert.equal(endpoint.keepUnusedDataFor, 0);
  assert.deepEqual(endpoint.transformResponse({ tripId: 'trip', participants: [{ ...person, phone: 'private', lastName: 'private', payment: {} }] }), { tripId: 'trip', participants: [person] });
  assert.deepEqual(endpoint.providesTags(null, null, { tripId: 'trip' }), [{ type: 'Trip', id: 'trip' }, { type: 'Booking', id: 'LIST' }]);
});

test('trip mapping preserves privacy so the section cannot advertise private trip participants', () => {
  const { mapServerTripToClient } = loader()('store/api/trip/tripMapper.ts');
  const raw = { id: 'trip', driverId: 'driver', status: 'upcoming', availableSeats: 3, pricePerSeat: 0 };
  assert.equal(mapServerTripToClient({ ...raw, isPrivate: true }).isPrivate, true);
  assert.equal(mapServerTripToClient({ ...raw, isPrivate: false }).isPrivate, false);
});

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  if (!React.isValidElement(node)) return [];
  if (typeof node.type === 'function') return nodes(node.type(node.props));
  return [node, ...nodes(node.props.children)];
}
function words(node) {
  if (Array.isArray(node)) return node.map(words).join(' ');
  if (React.isValidElement(node) && typeof node.type === 'function') return words(node.type(node.props));
  if (React.isValidElement(node)) return words(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
function view() {
  const harness = hookHarness();
  const roster = { eligible: true, online: true, participants: [person], refresh: () => {} };
  const native = { View: 'View', Text: 'Text', Image: 'Image', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
    StyleSheet: { create: styles => styles, hairlineWidth: 1 } };
  const load = loader({ react: { ...React, ...harness.react }, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/trip-detail/useTripCoPassengers': { useTripCoPassengers: () => roster },
    '@/hooks/trip-detail/useCoPassengerActions': { useCoPassengerActions: () => ({ profile() {}, message() {}, busy: false }) } });
  const { TripCoPassengers } = load('features/trip-detail/TripCoPassengers.tsx');
  return { roster, harness, render: (active = true) => harness.render(() => TripCoPassengers({ trip, booking, active })) };
}
test('compact section reveals public profiles and internal messaging on demand', () => {
  const v = view();
  let tree = v.render();
  assert.match(words(tree), /Autres passagers/);
  assert.doesNotMatch(words(tree), /Exemple/);
  nodes(tree).find(n => n.props.accessibilityLabel === 'Autres passagers').props.onPress();
  tree = v.render();
  assert.match(words(tree), /Exemple/);
  assert.equal(nodes(tree).some(n => n.props.accessibilityLabel === 'Voir le profil de Exemple'), true);
  assert.equal(nodes(tree).some(n => n.props.accessibilityLabel === 'Écrire à Exemple'), true);
  assert.equal(nodes(tree).filter(n => n.type === 'Button').length, 4);
  assert.equal(nodes(tree).some(n => n.props.numberOfLines || n.props.allowFontScaling === false), false);
  assert.doesNotMatch(words(v.render(false)), /Exemple/);
  v.roster.eligible = false;
  assert.equal(v.render(), null);
});
test('empty, loading, offline and denied states are explicit and hide the previous list', () => {
  const v = view();
  nodes(v.render()).find(n => n.type === 'Button').props.onPress();
  v.roster.participants = [];
  assert.match(words(v.render()), /Aucun autre passager confirmé/);
  v.roster.participants = [person]; v.roster.online = false;
  assert.match(words(v.render()), /Reconnectez-vous/);
  assert.doesNotMatch(words(v.render()), /Exemple/);
  v.roster.online = true; v.roster.denied = true;
  assert.match(words(v.render()), /Liste réservée/);
  v.roster.denied = false; v.roster.failed = true;
  assert.match(words(v.render()), /Réessayer/);
  v.roster.failed = false; v.roster.loading = true;
  assert.match(words(v.render()), /Chargement/);
  assert.doesNotMatch(words(v.render()), /Exemple/);
});
