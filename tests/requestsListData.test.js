const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const location = { name: 'Université', address: 'Avenue des Écoles', reference: 'Entrée nord', lat: -4.32, lng: 15.3 };
const request = (id, extra = {}) => ({ id, passengerId: 'passenger', passengerName: 'Alex',
  departure: location, arrival: { ...location, name: 'Gombe' }, status: 'pending',
  departureDateMin: '2099-09-29T10:00:00Z', departureDateMax: '2099-09-29T10:30:00Z',
  createdAt: '2026-09-29T08:00:00Z', ...extra });
const model = loader()('features/requests/requestsListModel.ts');

test('local search ignores accents, case and word order and indexes only once per data update', () => {
  let reads = 0;
  const item = Object.freeze({ ...request('first'), get departure() { reads++; return location; } });
  const source = Object.freeze([item, request('second', { passengerName: 'Jean' })]);
  const index = model.indexRequests(source), afterIndex = reads;
  for (const search of ['UNIVERSITE alex', 'alex    entree', 'GOMBE   ECOLES alex']) {
    assert.deepEqual(model.filterRequestIndex(index, search).map(item => item.id), ['first']);
  }
  assert.equal(reads, afterIndex, 'typing does not reread/normalize every location');
  assert.deepEqual(model.filterRequestIndex(index, '  '), source);
  assert.deepEqual(model.filterRequestIndex(index, 'absent'), []);
});

test('own requests prioritize responses/pickups, retain cancelled history and never mutate cached records', () => {
  const source = Object.freeze([
    request('expired', { status: 'expired' }), request('waiting'),
    request('offer', { status: 'offers_received' }),
    request('pickup', { status: 'driver_selected' }),
    request('linked', { status: 'driver_selected', tripId: 'trip' }),
    request('cancelled', { status: 'cancelled' }),
  ]);
  assert.deepEqual(model.rankOwnRequests(source).map(item => item.id), ['pickup', 'offer', 'waiting', 'linked', 'cancelled', 'expired']);
  assert.equal(source[0].id, 'expired');
});

function fixture() {
  const hooks = hookHarness(), calls = [], refreshes = [];
  const state = { active: true, online: true, tab: 'available', coordinateReads: 0,
    coordinates: { latitude: -4.32, longitude: 15.3 } };
  const profile = { data: { id: 'driver', role: 'driver' }, isFetching: false, isLoading: false, isError: false };
  const available = { data: [request('far', { departure: { ...location, lat: -4.5 } }),
    request('self', { passengerId: 'driver' }), request('near')], isFetching: false, isError: false, isLoading: false };
  const own = { data: [request('mine', { passengerId: 'driver' })], isFetching: false, isError: false, isLoading: false };
  const query = (name, value) => (_arg, options) => {
    calls.push({ name, options });
    return { isUninitialized: false, ...value, refetch: () => refreshes.push(name) };
  };
  const { useRequestsData } = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/store/hooks': { useAppSelector: selector => selector({ zwangaApi: { config: { online: state.online } } }) },
    '@/store/selectors': { selectUserCoordinates: () => { state.coordinateReads++; return state.coordinates; } },
    '@/store/api/userApi': { useGetCurrentUserQuery: query('profile', profile) },
    '@/store/api/tripRequestApi': { useGetAvailableTripRequestsQuery: query('available', available),
      useGetMyTripRequestsQuery: query('own', own) },
  })('hooks/requests/useRequestsData.ts');
  return { state, calls, refreshes, profile, available, own, hooks,
    render: () => hooks.render(() => useRequestsData(state.tab)),
    options: name => calls.filter(call => call.name === name).at(-1).options };
}

test('public requests exclude self and retain distance ranking without modifying the source', () => {
  const f = fixture(); const view = f.render();
  assert.deepEqual(view.requests.map(item => item.id), ['near', 'far']);
  assert.deepEqual(f.available.data.map(item => item.id), ['far', 'self', 'near']);
  assert.equal(view.isDriver, true); assert.equal(view.proximityAvailable, true);
  assert.equal(f.options('available').pollingInterval, 60000); assert.equal(f.options('own').skip, true);
  f.profile.data.role = 'passenger'; assert.equal(f.render().isDriver, false);
  f.state.coordinates = null; assert.equal(f.render().proximityAvailable, false);
  f.hooks.unmount();
});

test('passengers opening the available route only read their own commands, even with legacy driver flag', () => {
  const f = fixture(); f.profile.data.role = 'passenger'; f.profile.data.isDriver = true;
  f.own.data.push(request('someone-else'));
  const view = f.render();
  assert.equal(view.activeTab, 'my-requests');
  assert.deepEqual(view.requests.map(item => item.id), ['mine']);
  assert.equal(f.options('available').skip, true);
  assert.equal(f.options('available').pollingInterval, 0);
  assert.equal(f.options('own').skip, false);
  assert.equal(f.state.coordinateReads, 0);
  f.state.online = false;
  assert.deepEqual(f.render().requests.map(item => item.id), ['mine']);
  f.hooks.unmount();
});

test('only the selected list is subscribed; hidden screens pause reads, timers and coordinates', () => {
  const f = fixture(); f.render();
  const coordinateReads = f.state.coordinateReads;
  f.state.tab = 'my-requests'; assert.deepEqual(f.render().requests.map(item => item.id), ['mine']);
  assert.equal(f.options('available').skip, true); assert.equal(f.options('available').pollingInterval, 0);
  assert.equal(f.options('own').skip, false); assert.equal(f.state.coordinateReads, coordinateReads);
  f.state.active = false; f.render().refresh();
  for (const name of ['profile', 'available', 'own']) {
    assert.equal(f.options(name).skip, true); assert.equal(f.options(name).refetchOnFocus, false);
  }
  assert.equal(f.options('own').pollingInterval, 0); assert.deepEqual(f.refreshes, []);
  f.state.active = true; f.render().refresh();
  assert.equal(f.options('own').refetchOnMountOrArgChange, 30);
  assert.deepEqual(f.refreshes, ['own']);
  f.hooks.unmount();
});

test('profile loading/failure cannot expose unidentified cached requests; retry targets the profile', () => {
  const f = fixture(); f.profile.data = undefined; f.profile.isLoading = true;
  let view = f.render();
  assert.equal(view.isLoading, true); assert.equal(view.hasData, false);
  assert.deepEqual(view.requests, []); assert.equal(f.options('available').skip, true);
  f.profile.isLoading = false; f.profile.isError = true;
  view = f.render(); assert.equal(view.isLoading, false); assert.equal(view.isError, true);
  view.refresh(); assert.deepEqual(f.refreshes, ['profile']);
  f.profile.isError = false; view = f.render();
  assert.equal(view.isError, true, 'a successful but incomplete profile must offer retry, not spin indefinitely');
  assert.equal(view.isLoading, false);
  f.hooks.unmount();
});

test('empty, initial error and stale data remain distinct and refreshing never triggers another read', () => {
  const f = fixture(); f.available.data = undefined; f.available.isError = true;
  let view = f.render(); assert.equal(view.isError, true); assert.equal(view.hasData, false);
  f.available.data = [request('cached')]; view = f.render();
  assert.equal(view.isError, true); assert.equal(view.hasData, true); assert.equal(view.requests.length, 1);
  f.available.isFetching = true; f.render().refresh(); assert.deepEqual(f.refreshes, []);
  f.available.isFetching = false; f.available.isError = false; f.available.data = [];
  view = f.render(); assert.equal(view.hasData, true); assert.equal(view.isError, false);
  view.refresh(); assert.deepEqual(f.refreshes, ['available']);
  f.hooks.unmount();
});

test('offline keeps cached requests visible and suppresses polling and manual refresh until reconnect', () => {
  const f = fixture(); f.render(); f.state.online = false;
  const view = f.render(); view.refresh();
  assert.equal(view.requests.length, 2);
  assert.equal(view.isLoading, false); assert.equal(view.isError, true);
  for (const name of ['profile', 'available', 'own']) assert.equal(f.options(name).skip, true);
  assert.equal(f.options('available').pollingInterval, 0); assert.deepEqual(f.refreshes, []);
  f.state.online = true; f.render(); assert.equal(f.options('available').skip, false);
  assert.equal(f.options('available').refetchOnFocus, false); f.hooks.unmount();
});

test('first opening offline reports unavailable data rather than spinning forever or showing a false empty list', () => {
  const f = fixture(); f.state.online = false; f.profile.data = undefined;
  f.profile.isUninitialized = true; f.available.data = undefined; f.available.isUninitialized = true;
  const view = f.render(); assert.equal(view.isLoading, false); assert.equal(view.isFetching, false);
  assert.equal(view.isError, true); assert.equal(view.hasData, false); f.hooks.unmount();
});
