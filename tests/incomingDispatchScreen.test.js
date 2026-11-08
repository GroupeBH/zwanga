const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tick = () => new Promise(resolve => setImmediate(resolve));
const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(words).join('') : words(tree?.props?.children ?? '');
const all = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(all) : [tree, ...all(tree.props?.children)];
const detail = requestId => ({ pathname: '/request-details/[id]', params: { id: requestId } });
const noAnswer = () => assert.fail('An entry link must not submit or replay an accept/refuse action');

function fixture(t) {
  const hooks = hookHarness(), queries = [], routes = [], dismissals = [], actions = [];
  const offer = { id: id(2), driverId: id(1), requestId: id(3), status: 'pending', actionable: true,
    vehicleName: null, request: { id: id(3), passengerName: 'Passager test' } };
  const state = { params: { kind: 'dispatch', id: id(2), driverId: id(1) }, userId: id(1), active: true, retries: 0,
    query: { currentData: offer, data: offer, isFetching: false, isLoading: false, isError: false,
      refetch: async () => { state.retries++; if (state.retryError) throw state.retryError; } } };
  const router = { replace: href => routes.push(href) };
  const dispatch = action => actions.push(action);
  const Screen = loader({ react: hooks.react,
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button',
      ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'Safe' },
    'expo-router': { useLocalSearchParams: () => state.params, useRouter: () => router },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: fn => fn({ auth: { user: state.userId ? { id: state.userId } : null } }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/store/api/driverDispatchApi': {
      useGetDispatchOfferQuery: (key, options) => { queries.push({ key, ...options }); return state.query; },
      useRespondToDispatchOfferMutation: noAnswer, useRespondToBookingInvitationMutation: noAnswer,
    },
    '@/services/driverNotifications': { consumeDriverAction: noAnswer,
      dismissDriverInvitation: async invitation => { dismissals.push(invitation); if (state.dismissError) throw state.dismissError; } },
    '@/features/notifications/IncomingBookingRedirect': { IncomingBookingRedirect: 'BookingRedirect' },
  })('app/incoming-driver.tsx').default;
  t.after(() => hooks.unmount());
  const render = () => hooks.render(() => { const element = Screen(); return element.type(element.props); });
  return { hooks, state, queries, routes, dismissals, actions, render, route: Screen };
}

test('a dispatch with no assigned vehicle opens the regular command detail without an extra decision screen', t => {
  const f = fixture(t);
  const tree = f.render(); f.render();
  assert.deepEqual(f.routes, [detail(id(3))], 'offer ID must resolve to the request ID, not become a request ID');
  assert.deepEqual(f.dismissals, [], 'opening a still pending command must not stop its alert');
  assert.deepEqual(f.actions, []);
  assert.match(words(tree), /Ouverture de la commande/);
  assert.doesNotMatch(words(tree), /Accepter|Refuser|Voir les détails|Passager test/);
  assert.ok(f.queries.every(query => query.refetchOnMountOrArgChange === true));
  assert.ok(f.queries.every(query => !query.pollingInterval), 'no parallel offer polling while the detail owns availability');
});

test('a vehicle already assigned by legacy dispatch still uses the same detail and vehicle controls', t => {
  const f = fixture(t); f.state.query.currentData.vehicleName = 'Véhicule test';
  f.render(); assert.deepEqual(f.routes, [detail(id(3))]); assert.deepEqual(f.actions, []);
});

test('booking notification links keep the existing booking redirect', t => {
  const f = fixture(t); f.state.params.kind = 'booking';
  assert.equal(f.route().type, 'BookingRedirect'); assert.equal(f.queries.length, 0);
});

for (const decision of ['accept', 'decline']) test(`URL ${decision} and old action events never authorize a mutation`, t => {
  const f = fixture(t);
  Object.assign(f.state.params, { decision, action: `driver-${decision}`, actionEvent: '123', requestId: id(90), accept: 'true' });
  f.render();
  assert.deepEqual(f.routes, [detail(id(3))]); assert.deepEqual(f.actions, []);
  f.state.params.actionEvent = '124'; f.render();
  assert.equal(f.routes.length, 1);
});

for (const [label, patch] of [
  ['fetching', { isFetching: true }], ['loading', { isLoading: true }], ['network error', { isError: true }],
  ['data from an older argument only', { currentData: undefined }],
  ['mismatched offer ID', { currentData: { id: id(20), driverId: id(1), requestId: id(3), request: { id: id(3) } } }],
  ['another recipient', { currentData: { id: id(2), driverId: id(9), requestId: id(3), request: { id: id(3) } } }],
  ['mismatched request ID', { currentData: { id: id(2), driverId: id(1), requestId: id(3), request: { id: id(4) } } }],
  ['missing request', { currentData: { id: id(2), driverId: id(1), requestId: id(3) } }],
  ['invalid request ID', { currentData: { id: id(2), driverId: id(1), requestId: '../auth', request: { id: '../auth' } } }],
]) test(`${label} cannot navigate, dismiss an alert or invite contact`, t => {
  const f = fixture(t); Object.assign(f.state.query, patch);
  const tree = f.render();
  assert.deepEqual(f.routes, []); assert.deepEqual(f.dismissals, []); assert.deepEqual(f.actions, []);
  assert.doesNotMatch(words(tree), /Passager test/);
});

for (const [label, patch] of [
  ['background', { active: false }], ['logged out', { userId: undefined }], ['different account', { userId: id(9) }],
  ['invalid offer', { params: { kind: 'dispatch', id: '../auth' } }],
  ['missing kind', { params: { id: id(2) } }], ['unknown kind', { params: { kind: 'nearby', id: id(2) } }],
  ['another URL recipient', { params: { kind: 'dispatch', id: id(2), driverId: id(9) } }],
]) test(`${label} skips the server read and does not redirect`, t => {
  const f = fixture(t); Object.assign(f.state, patch); f.render();
  assert.equal(f.queries[0].skip, true);
  assert.deepEqual(f.routes, []); assert.deepEqual(f.dismissals, []); assert.deepEqual(f.actions, []);
});

test('old links without driverId still require server ownership', t => {
  const f = fixture(t); delete f.state.params.driverId;
  f.state.query.currentData = { ...f.state.query.currentData, driverId: id(9) };
  f.render(); assert.deepEqual(f.routes, []);
  f.state.query.currentData = { ...f.state.query.currentData, driverId: id(1) };
  f.render(); assert.deepEqual(f.routes, [detail(id(3))]);
});

test('a late read cannot redirect after logout; a fresh active session can open its own command', t => {
  const f = fixture(t); f.state.query.isFetching = true; f.render();
  f.state.userId = undefined; f.state.query.isFetching = false; f.render();
  assert.deepEqual(f.routes, []); assert.deepEqual(f.dismissals, []);
  f.state.userId = id(1); f.state.active = false; f.render();
  assert.deepEqual(f.routes, []);
  f.state.active = true; f.render(); assert.deepEqual(f.routes, [detail(id(3))]);
});

test('a confirmed native acceptance restores contact once without submitting a second acceptance', t => {
  const f = fixture(t);
  f.state.query.currentData = { ...f.state.query.currentData, status: 'accepted', actionable: false };
  f.state.query.isFetching = true; f.render();
  assert.deepEqual(f.routes, []); assert.deepEqual(f.dismissals, []); assert.deepEqual(f.actions, []);
  f.state.query.isFetching = false; f.render(); f.render();
  assert.deepEqual(f.routes, [detail(id(3))]);
  assert.deepEqual(f.dismissals, [{ kind: 'dispatch', id: id(2), driverId: id(1) }]);
  assert.equal(f.actions.length, 1);
  assert.equal(f.actions[0].payload.userId, id(1)); assert.equal(f.actions[0].payload.requestId, id(3));
  assert.ok(Number.isFinite(f.actions[0].payload.createdAt));
});

test('a confirmed refusal does not reopen the refused command', t => {
  const f = fixture(t);
  f.state.query.currentData = { ...f.state.query.currentData, status: 'declined', actionable: false };
  f.render();
  assert.deepEqual(f.routes, ['/(tabs)']); assert.equal(f.dismissals.length, 1); assert.deepEqual(f.actions, []);
});

for (const status of ['expired', 'cancelled']) test(`a ${status} alert leaves command availability to the detail's server read`, t => {
  const f = fixture(t);
  f.state.query.currentData = { ...f.state.query.currentData, status, actionable: false };
  f.render();
  assert.deepEqual(f.routes, [detail(id(3))]); assert.equal(f.dismissals.length, 1); assert.deepEqual(f.actions, []);
});

test('network failure has a working retry and never fakes acceptance or silences a pending alert', async t => {
  const f = fixture(t); f.state.query.isError = true;
  const tree = f.render();
  assert.match(words(tree), /Impossible de charger.*connexion/);
  const retry = all(tree).find(node => node.type === 'Button' && words(node) === 'Réessayer');
  f.state.retryError = new Error('Offline'); retry.props.onPress(); await tick();
  assert.equal(f.state.retries, 1); assert.deepEqual(f.routes, []); assert.deepEqual(f.dismissals, []);
  f.state.query.isError = false; f.render(); f.render();
  assert.deepEqual(f.routes, [detail(id(3))]);
});

test('going Home is available during a slow read and does not reject the command', t => {
  const f = fixture(t); f.state.query.isFetching = true;
  all(f.render()).find(node => node.type === 'Button' && words(node) === 'Retour à l’accueil').props.onPress();
  f.state.query.isFetching = false; f.render();
  assert.deepEqual(f.routes, ['/(tabs)']); assert.deepEqual(f.actions, []); assert.deepEqual(f.dismissals, []);
});

for (const status of [403, 404, 410]) test(`HTTP ${status} reports an unavailable command, not a connection problem`, t => {
  const f = fixture(t); f.state.query.isError = true; f.state.query.error = { status };
  const tree = f.render();
  assert.match(words(tree), /commande n’est pas disponible/);
  assert.doesNotMatch(words(tree), /connexion|Réessayer/);
  assert.deepEqual(f.routes, []); assert.deepEqual(f.dismissals, []);
});

test('a notification cleanup failure does not block access to confirmed command details', async t => {
  const f = fixture(t); f.state.dismissError = new Error('Native unavailable');
  f.state.query.currentData = { ...f.state.query.currentData, status: 'accepted', actionable: false };
  f.render(); await tick();
  assert.deepEqual(f.routes, [detail(id(3))]); assert.equal(f.actions.length, 1);
});

test('a different link resolves only its matching current data and has its own route key', t => {
  const f = fixture(t); const firstKey = f.route().key; f.render();
  f.state.params.id = id(4); assert.notEqual(f.route().key, firstKey);
  f.render(); assert.deepEqual(f.routes, [detail(id(3))]);
  f.state.query.currentData = { ...f.state.query.currentData, id: id(4), requestId: id(5), request: { id: id(5) } };
  f.render(); f.render(); assert.deepEqual(f.routes, [detail(id(3)), detail(id(5))]);
});
