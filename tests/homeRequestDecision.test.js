const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const later = ms => new Date(Date.now() + ms).toISOString();

function fixture(t) {
  const hooks = hookHarness();
  const order = { id: 'request', passengerId: 'passenger', status: 'pending', vehicleType: 'car',
    departureDateMin: later(-30000), departureDateMax: later(600000), numberOfSeats: 1 };
  const car = { id: 'car', ownerId: 'driver', type: 'car', isActive: true };
  const state = { userId: 'driver', version: 1, verified: true, online: true,
    app: { currentState: 'active' }, queries: [], accepts: [], acknowledgements: [], dismissals: [], routes: [], retries: 0 };
  state.detail = { currentData: order, isFetching: false, refetch: async () => state.retries++ };
  state.vehicles = { currentData: [car], isFetching: false, refetch: async () => state.retries++ };
  state.result = async () => ({ trip: { id: 'trip' }, tripRequest: { ...order, selectedDriverId: 'driver' } });
  const { useHomeRequestDecision } = loader({ react: hooks.react,
    'react-native': { AppState: state.app },
    '@/store/hooks': { useAppSelector: fn => fn({ auth: { user: { id: state.userId } } }) },
    '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({ isIdentityVerified: state.verified }) },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: active => active && state.online,
      displayReadOptions: (active, interval = 0) => ({ skip: !active, pollingInterval: active ? interval : 0 }) },
    '@/store/api/tripRequestApi': {
      useGetTripRequestByIdQuery: (id, options) => { state.queries.push({ id, ...options }); return state.detail; },
      useAcceptTripRequestMutation: () => [arg => { state.accepts.push(arg); return { unwrap: () => state.result() }; }],
    },
    '@/store/api/vehicleApi': { useGetVehiclesQuery: (_, options) => { state.queries.push(options); return state.vehicles; } },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    '@/services/rideAlertSession': { acknowledgeRideAlerts: predicate => state.acknowledgements.push(predicate) },
    '@/services/driverNotifications': { dismissDriverDecision: async (...args) => state.dismissals.push(args) },
    '@/utils/errorHelpers': { getApiErrorMessage: (_, fallback) => fallback },
  })('hooks/home/useHomeRequestDecision.ts');
  const hidden = [];
  const props = { userId: 'driver', enabled: true, request: order,
    dismissPriority: key => hidden.push(key), router: { push: route => state.routes.push(route) } };
  t.after(() => hooks.unmount());
  return { state, props, hidden, hooks, car, render: () => hooks.render(() => useHomeRequestDecision(props)) };
}

test('the only compatible active owned vehicle is selected; no mutation before an explicit tap', t => {
  const f = fixture(t);
  f.state.vehicles.currentData.push({ ...f.car, id: 'inactive', isActive: false },
    { ...f.car, id: 'moto', type: 'moto' }, { ...f.car, id: 'other', ownerId: 'other-driver' });
  const decision = f.render();
  assert.equal(decision.visible, true); assert.equal(decision.canAccept, true);
  assert.equal(decision.vehicle.id, 'car'); assert.equal(decision.vehicles.length, 1);
  assert.equal(f.state.accepts.length, 0);
});

test('multiple compatible vehicles require an explicit choice, with multi-type requests supported', async t => {
  const f = fixture(t); f.props.request.vehicleTypes = ['car', 'motorcycle_2_wheels'];
  f.state.vehicles.currentData.push({ ...f.car, id: 'moto', type: 'moto' });
  let d = f.render(); assert.equal(d.canAccept, false); await d.accept(); assert.equal(f.state.accepts.length, 0);
  d.selectVehicle('moto'); d = f.render(); assert.equal(d.canAccept, true);
  assert.equal(d.vehicle.id, 'moto'); await d.accept(); assert.equal(f.state.accepts[0].payload.vehicleId, 'moto');
});

test('ignore closes locally without refusing, accepting, stopping audio or navigating, including refetches', t => {
  const f = fixture(t); f.render().close();
  f.props.request = { ...f.props.request }; f.state.detail.currentData = f.props.request;
  assert.equal(f.render().visible, false);
  assert.equal(f.hidden.length, 1); assert.equal(f.state.accepts.length, 0);
  assert.equal(f.state.acknowledgements.length, 0); assert.equal(f.state.routes.length, 0);
});

test('success uses the existing endpoint once, waits for overlay closure, and leaves audio cleanup to existing middleware', async t => {
  const f = fixture(t); let complete;
  f.state.result = () => new Promise(resolve => { complete = resolve; });
  const d = f.render(); const first = d.accept(); await d.accept();
  assert.equal(f.state.accepts.length, 1); assert.equal(f.render().busy, true);
  f.render().close(); assert.equal(f.hidden.length, 0);
  f.props.request = null; assert.equal(f.render().order.id, 'request', 'cache invalidation must not lose a pending decision');
  complete({}); await first; await tick();
  const finished = f.render(); assert.equal(finished.visible, false); assert.equal(f.state.routes.length, 0);
  finished.onDismiss(); finished.onDismiss();
  assert.deepEqual(f.state.routes, [{ pathname: '/request-details/[id]', params: { id: 'request' } }]);
  assert.equal(f.state.accepts[0].payload.requiresPassengerKyc, false);
  assert.ok(Date.parse(f.state.accepts[0].payload.departureDate) >= Date.parse(d.order.departureDateMin));
  assert.equal(f.state.acknowledgements.length, 0, 'no second audio lifecycle from Home');
});

test('failed acceptance is not acknowledged or hidden, and can be retried', async t => {
  const f = fixture(t); f.state.result = async () => { throw new Error('Offline'); };
  await f.render().accept(); const d = f.render();
  assert.equal(d.visible, true); assert.equal(d.busy, false); assert.match(d.error, /non confirmée/);
  assert.equal(f.hidden.length, 0); assert.equal(f.state.acknowledgements.length, 0); assert.equal(f.state.routes.length, 0);
  f.state.result = async () => ({}); await d.accept(); assert.equal(f.state.accepts.length, 2);
});

for (const scenario of ['background', 'covered Home', 'another account', 'offline', 'identity', 'vehicle removed',
  'stale detail', 'fetching', 'read error', 'cancelled', 'assigned', 'own order', 'own pending offer', 'expired']) {
  test(`${scenario} prevents direct acceptance`, async t => {
    const f = fixture(t);
    switch (scenario) {
      case 'background': f.props.enabled = false; f.state.app.currentState = 'background'; break;
      case 'covered Home': f.props.enabled = false; break;
      case 'another account': f.state.userId = 'other'; break;
      case 'offline': f.state.online = false; break;
      case 'identity': f.state.verified = false; break;
      case 'vehicle removed': f.state.vehicles.currentData = []; break;
      case 'stale detail': f.state.detail.currentData = { ...f.props.request, id: 'previous' }; break;
      case 'fetching': f.state.detail.isFetching = true; break;
      case 'read error': f.state.detail.isError = true; break;
      case 'cancelled': f.props.request.status = 'cancelled'; break;
      case 'assigned': f.props.request.selectedDriverId = 'other'; break;
      case 'own order': f.props.request.passengerId = 'driver'; break;
      case 'own pending offer': f.props.request.offers = [{ driverId: 'driver', status: 'pending' }]; break;
      case 'expired': f.props.request.departureDateMax = later(-4 * 3600000); break;
    }
    const d = f.render(); assert.equal(d.canAccept, false); await d.accept();
    assert.equal(f.state.accepts.length, 0);
    if (!f.props.enabled || scenario === 'another account') {
      assert.equal(d.visible, false); assert.ok(f.state.queries.every(query => query.skip && !query.pollingInterval));
    }
  });
}

for (const scenario of ['unmount', 'logout', 'background']) test(`late success after ${scenario} cannot navigate`, async t => {
  const f = fixture(t); let complete;
  f.state.result = () => new Promise(resolve => { complete = resolve; });
  const d = f.render(), task = d.accept();
  if (scenario === 'unmount') f.hooks.unmount();
  if (scenario === 'logout') f.state.version++;
  if (scenario === 'background') { f.props.enabled = false; f.state.app.currentState = 'background'; f.render(); }
  complete({}); await task; await tick(); d.onDismiss();
  assert.equal(f.state.routes.length, 0);
  if (scenario !== 'background') assert.equal(f.state.acknowledgements.length, 0);
});

test('a stale handler cannot accept after a different candidate or a refreshed unavailable result', async t => {
  const f = fixture(t); const old = f.render();
  f.state.detail.currentData = { ...f.props.request, status: 'cancelled' }; f.render();
  await old.accept(); assert.equal(f.state.accepts.length, 0);
});

test('details open only after the modal disappears; returning to Home does not replay navigation', t => {
  const f = fixture(t); f.render().openDetails(); const d = f.render();
  assert.equal(d.visible, false); assert.equal(f.state.routes.length, 0); d.onDismiss();
  assert.equal(f.state.routes.length, 1); assert.equal(f.state.accepts.length, 0);
  f.props.enabled = false; f.render(); f.props.enabled = true; f.render().onDismiss();
  assert.equal(f.state.routes.length, 1);
});

test('post-trip and Home can release their native map through the existing guarded navigation callback', async t => {
  const f = fixture(t), released = [];
  f.props.onOpenRequestDetail = id => released.push(id);
  await f.render().accept(); const finished = f.render();
  assert.deepEqual(released, []); finished.onDismiss(); finished.onDismiss();
  assert.deepEqual(released, ['request']); assert.equal(f.state.routes.length, 0, 'no direct router push bypasses map release');
});

test('a confirmed acceptance while backgrounded does not block later orders after returning Home', async t => {
  const f = fixture(t); let complete;
  f.state.result = () => new Promise(resolve => { complete = resolve; });
  const task = f.render().accept();
  f.props.enabled = false; f.state.app.currentState = 'background'; f.render();
  complete({}); await task;
  f.props.request = { ...f.props.request, id: 'next-order' }; f.state.detail.currentData = f.props.request;
  f.props.enabled = true; f.state.app.currentState = 'active';
  const d = f.render(); assert.equal(d.visible, true); assert.equal(d.canAccept, true);
  d.onDismiss(); assert.equal(f.state.routes.length, 0);
});

test('a replacement session cannot remain locked by an old pending acceptance', async t => {
  const f = fixture(t); let complete;
  f.state.result = () => new Promise(resolve => { complete = resolve; });
  const task = f.render().accept(); f.render(); f.state.version++;
  f.render(); assert.equal(f.render().busy, false);
  complete({}); await task; f.render().onDismiss();
  assert.equal(f.state.routes.length, 0); assert.equal(f.hidden.length, 0);
});
