const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const later = ms => new Date(Date.now() + ms).toISOString();
const order = (id = 'next', extra = {}) => ({ id, passengerId: 'passenger', status: 'pending', vehicleType: 'car',
  departureDateMin: later(-10000), departureDateMax: later(600000), numberOfSeats: 1,
  departure: { lat: -4.31, lng: 15.3 }, ...extra });

function fixture(t) {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const state = { user: { id: 'driver', role: 'driver' }, version: 1, online: true, appActive: true,
    app: { currentState: 'active' }, feed: { currentData: [order()], isSuccess: true, isFetching: false, isError: false },
    reads: [], hidden: {}, accepts: [], routes: [], ignores: [] };
  const props = { trip: { id: 'finished', driverId: 'driver', status: 'ongoing' }, active: true, blocked: false,
    coordinate: { latitude: -4.31, longitude: 15.3 } };
  state.result = async () => ({});
  const load = loader({ react: hooks.react,
    'react-native': { AppState: state.app, StyleSheet: { create: x => x } },
    '@/store/hooks': { useAppSelector: fn => fn({ auth: { user: state.user }, zwangaApi: { config: { online: state.online } } }) },
    '@/hooks/useAppIsActive': { useAppIsActive: () => state.appActive },
    '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({ isIdentityVerified: true }) },
    '@/hooks/home/useHomePriorityDismissals': { useHomePriorityDismissals: () => ({ hiddenHomePriorities: state.hidden,
      dismissPriority: key => { state.ignores.push(key); state.hidden[key] = true; } }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    '@/utils/errorHelpers': { getApiErrorMessage: (_, fallback) => fallback },
    '@/store/api/tripRequestApi': {
      useGetHomeTripRequestsQuery: (_, options) => { state.reads.push(options); return state.feed; },
      useGetTripRequestByIdQuery: id => ({ currentData: state.feed.currentData?.find(item => item.id === id), refetch: async () => {} }),
      useAcceptTripRequestMutation: () => [arg => { state.accepts.push(arg); return { unwrap: () => state.result() }; }],
    },
    '@/store/api/vehicleApi': { useGetVehiclesQuery: () => ({
      currentData: [{ id: 'car', ownerId: 'driver', type: 'car', isActive: true }], refetch: async () => {},
    }) },
  });
  const { useNextRequestAfterTrip } = load('hooks/driver-navigation/useNextRequestAfterTrip.ts');
  const { useHomeRequestDecision } = load('hooks/home/useHomeRequestDecision.ts');
  const render = () => hooks.render(() => {
    const next = useNextRequestAfterTrip(props);
    const decision = useHomeRequestDecision({ ...next, router: { push: route => state.routes.push(route) } });
    return { ...next, decision };
  });
  const complete = () => { render(); props.trip = { ...props.trip, status: 'completed' }; return render(); };
  return { state, props, render, complete, load };
}

test('a confirmed completion opens the existing accept/ignore modal, not while the ride is ongoing', t => {
  const f = fixture(t);
  assert.equal(f.render().decision.visible, false);
  assert.equal(f.state.reads.at(-1).skip, true);
  const next = f.complete();
  assert.equal(next.request.id, 'next'); assert.equal(next.decision.visible, true); assert.equal(next.decision.canAccept, true);
  assert.equal(f.state.reads.at(-1).skip, false); assert.ok(f.state.reads.at(-1).pollingInterval > 0);
  assert.equal(f.state.reads.at(-1).refetchOnMountOrArgChange, true);
  assert.equal(f.state.accepts.length, 0, 'opening never accepts automatically');
});

test('completion summary, payments/security blockers, background, blur and offline defer the next request', t => {
  const f = fixture(t); f.render(); f.props.trip.status = 'completed';
  for (const [object, key, value] of [[f.props, 'blocked', true], [f.props, 'active', false],
    [f.state, 'appActive', false], [f.state, 'online', false]]) {
    const before = object[key]; object[key] = value;
    assert.equal(f.render().decision.visible, false);
    assert.equal(f.state.reads.at(-1).skip, true); assert.equal(f.state.reads.at(-1).pollingInterval, 0);
    object[key] = before;
    assert.equal(f.render().decision.visible, true);
  }
});

test('post-trip lookup discards cached rows during refresh/error and recovers from the same REST feed', t => {
  const f = fixture(t); f.state.feed.isFetching = true;
  assert.equal(f.complete().decision.visible, false);
  f.state.feed.isFetching = false; f.state.feed.isError = true;
  assert.equal(f.render().request, null);
  f.state.feed.isError = false; f.state.feed.currentData = [];
  assert.equal(f.render().request, null);
  f.state.feed.currentData = [order('arrived-later')];
  assert.equal(f.render().request.id, 'arrived-later');
});

test('an already visible command stays stable during periodic refreshes and closes if removed by the server', t => {
  const f = fixture(t); assert.equal(f.complete().request.id, 'next');
  f.state.feed.isFetching = true;
  assert.equal(f.render().request.id, 'next', 'no flicker every polling interval');
  f.state.feed.isFetching = false; f.state.feed.currentData = [];
  assert.equal(f.render().request, null);
  f.state.feed.currentData = [order('new')]; assert.equal(f.render().request.id, 'new');
  f.props.active = false; assert.equal(f.render().request, null);
  f.props.active = true; f.state.feed.isFetching = true;
  assert.equal(f.render().request, null, 'resuming must wait for fresh availability');
});

for (const scenario of ['old trip', 'cancelled', 'other owner', 'passenger', 'new session', 'different trip']) {
  test(`${scenario} does not arm a post-completion modal`, t => {
    const f = fixture(t);
    if (scenario !== 'old trip') f.render();
    if (scenario === 'other owner') f.props.trip.driverId = 'other';
    if (scenario === 'passenger') f.state.user.role = 'passenger';
    if (scenario === 'new session') f.state.version++;
    if (scenario === 'different trip') f.props.trip.id = 'history';
    f.props.trip.status = scenario === 'cancelled' ? 'cancelled' : 'completed';
    assert.equal(f.render().decision.visible, false);
    assert.equal(f.state.reads.at(-1).skip, true);
  });
}

test('only available foreign commands without an ignored card or own pending proposal are eligible', t => {
  const f = fixture(t), keys = f.load('features/home/homePriorityDismissal.ts').homePriorityKeys;
  // Dismiss the exact revision in the feed, not another order() with a later millisecond.
  const ignored = order('ignored');
  f.state.hidden[keys.nearbyRequest(ignored)] = true;
  f.state.feed.currentData = [order('own', { passengerId: 'driver' }), order('assigned', { selectedDriverId: 'other' }),
    order('expired', { departureDateMax: later(-4 * 3600000) }), order('cancelled', { status: 'cancelled' }),
    order('linked', { tripId: 'finished' }), order('offered', { offers: [{ driverId: 'driver', status: 'pending' }] }),
    ignored, order('far', { departure: { lat: -4.5, lng: 15.5 } }), order('near')];
  assert.equal(f.complete().request.id, 'near');
});

test('ignore closes once without declining or draining every other available command', t => {
  const f = fixture(t); f.state.feed.currentData.push(order('second'));
  f.complete().decision.close();
  let result = f.render(); assert.equal(result.decision.visible, false); assert.equal(result.request, null);
  assert.equal(f.state.accepts.length, 0); assert.equal(f.state.ignores.length, 1); assert.equal(f.state.reads.at(-1).skip, true);
  f.props.active = false; f.render(); f.props.active = true;
  assert.equal(f.render().request, null, 'returning to the old summary does not reopen a next command');
  f.props.trip = { id: 'following-trip', driverId: 'driver', status: 'ongoing' }; f.render();
  f.props.trip.status = 'completed'; result = f.render();
  assert.equal(result.request.id, 'second', 'a new finished trip can offer a new command');
});

test('accept remains single-flight and opens the command only after the overlay closes', async t => {
  const f = fixture(t); let resolve;
  f.state.result = () => new Promise(done => { resolve = done; });
  const d = f.complete().decision, task = d.accept(); await d.accept();
  assert.equal(f.state.accepts.length, 1); assert.equal(f.render().decision.busy, true);
  resolve({}); await task;
  const done = f.render();
  assert.equal(done.decision.visible, false); assert.equal(done.enabled, true);
  assert.equal(f.state.reads.at(-1).skip, true); assert.equal(f.state.routes.length, 0);
  done.decision.onDismiss(); done.decision.onDismiss();
  assert.deepEqual(f.state.routes, [{ pathname: '/request-details/[id]', params: { id: 'next' } }]);
});

test('failed acceptance retains the command for retry; a new session cannot inherit a pending decision', async t => {
  const f = fixture(t); f.state.result = async () => { throw new Error('offline'); };
  await f.complete().decision.accept();
  let result = f.render(); assert.equal(result.decision.visible, true); assert.ok(result.decision.error);
  assert.equal(f.state.ignores.length, 0);
  let resolve; f.state.result = () => new Promise(done => { resolve = done; });
  const task = result.decision.accept(); f.state.version++; f.render(); resolve({}); await task;
  result = f.render(); result.decision.onDismiss();
  assert.equal(result.decision.visible, false); assert.equal(f.state.routes.length, 0); assert.equal(f.state.ignores.length, 0);
});

test('only confirmed completeTrip results invalidate the available command lists', () => {
  const { buildConfirmDriverTripInterruptionEndpoints } = loader({
    './tripMapper': { mapServerTripToClient: value => value },
  })('store/api/trip/confirmDriverTripInterruption.endpoints.ts');
  const endpoint = buildConfirmDriverTripInterruptionEndpoints({ mutation: value => value, query: value => value }).completeTrip;
  const list = { type: 'TripRequest', id: 'LIST' };
  assert.ok(endpoint.invalidatesTags({ status: 'completed' }, undefined, 'trip').some(tag => JSON.stringify(tag) === JSON.stringify(list)));
  for (const result of [undefined, { status: 'ongoing' }]) {
    assert.equal(endpoint.invalidatesTags(result, {}, 'trip').some(tag => tag.type === 'TripRequest'), false);
  }
  assert.equal(endpoint.query('trip').url, '/trips/trip/complete');
});
