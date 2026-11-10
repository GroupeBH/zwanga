const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function reminderFixture(t) {
  const hooks = hookHarness(), dialogs = [], routes = [];
  const pathnameRef = { current: '/request-details/new-command' };
  const currentUserRef = { current: { id: 'passenger' } };
  const shown = new Set();
  const request = { id: 'old-command', passengerId: 'passenger', status: 'driver_selected',
    selectedDriverId: 'driver', driverPickupOverdueNotifiedAt: new Date().toISOString(),
    departureDateMax: new Date(Date.now() - 60000).toISOString() };
  const io = { read: async () => [request] };
  const load = loader({ react: hooks.react, '@/store/api/tripRequestApi': {},
    '@/components/ui/DialogProvider': {}, '@/utils/notificationNavigation': { extractTripRequestId: data => data.tripRequestId },
    '@/utils/requestNavigation': { getTripRequestDetailHref: id => `/request-details/${id}` } });
  const { useOverdueRequestNotification, canPresentOverdueRequest } = load('hooks/notifications/useOverdueRequestNotification.ts');
  const render = () => hooks.render(() => useOverdueRequestNotification({ pathnameRef, currentUserRef,
    activeOverdueAccountIdRef: { current: null }, activeOverdueRequestIdRef: { current: null },
    shownOverdueRequestsRef: { current: shown }, showDialog: dialog => dialogs.push(dialog),
    router: { push: route => routes.push(route) }, refetchMyTripRequests: () => ({ unwrap: () => io.read() }),
    releaseOverdueDriver: () => { throw Error('A reminder must never release a driver implicitly'); },
  }));
  t.after(() => hooks.unmount());
  return { render, dialogs, routes, shown, request, io, pathnameRef, currentUserRef, canPresentOverdueRequest };
}

test('an overdue reminder does not cover an unrelated command or mark it as seen', t => {
  const f = reminderFixture(t), flow = f.render();
  for (const path of ['/request-details/new-command', '/request/new-command', '/trip/navigate/other',
    '/booking/payment', '/chat/thread', '/incoming-driver']) {
    f.pathnameRef.current = path;
    assert.equal(flow.presentPassengerOverdueModal(f.request), false, path);
  }
  assert.equal(f.dialogs.length, 0); assert.equal(f.shown.size, 0);
  f.pathnameRef.current = '/request-details/old-command';
  flow.presentPassengerOverdueModal(f.request); flow.presentPassengerOverdueModal(f.request);
  assert.equal(f.dialogs.length, 1, 'deferred reminder displays once on its own command');
  assert.equal(f.canPresentOverdueRequest('/', f.request.id), true, 'Home reminder remains available');
});

test('a delayed overdue response respects navigation and account changes', async t => {
  const f = reminderFixture(t), flow = f.render();
  let finish;
  f.io.read = () => new Promise(resolve => { finish = resolve; });
  const data = { type: 'trip_request_driver_overdue', tripRequestId: f.request.id, recipientUserId: 'passenger' };
  f.pathnameRef.current = '/';
  const pending = flow.handlePassengerOverdueNotification(data);
  f.pathnameRef.current = '/request-details/new-command'; finish([f.request]); await pending;
  assert.equal(f.dialogs.length, 0); assert.equal(f.shown.size, 0);
  const staleTap = flow.handlePassengerOverdueNotification(data, undefined, true);
  f.currentUserRef.current = { id: 'another-account' }; finish([f.request]); await staleTap;
  assert.deepEqual(f.routes, []);
});

test('an explicit overdue notification tap opens only the freshly verified owned command', async t => {
  const f = reminderFixture(t), flow = f.render();
  const data = { type: 'trip_request_driver_overdue', tripRequestId: f.request.id, recipientUserId: 'passenger' };
  await flow.handlePassengerOverdueNotification(data, undefined, true);
  assert.deepEqual(f.routes, ['/request-details/old-command']); assert.equal(f.dialogs.length, 0);
  f.io.read = async () => [{ ...f.request, status: 'cancelled' }];
  await flow.handlePassengerOverdueNotification(data, undefined, true);
  await flow.handlePassengerOverdueNotification({ ...data, recipientUserId: 'other' }, undefined, true);
  assert.equal(f.routes.length, 1, 'stale and foreign notifications cannot navigate');
});

test('release-driver API preserves schedule-only intent and supports legacy immediate searches', () => {
  const builder = { query: value => value, mutation: value => value };
  const { tripRequestApi } = loader({
    './baseApi': { baseApi: { injectEndpoints: config => ({ endpoints: config.endpoints(builder) }) } },
    './tripApi': {},
  })('store/api/tripRequestApi.ts');
  const endpoint = tripRequestApi.endpoints.releaseOverdueDriver;
  for (const [arg, searchNow] of [
    ['request', true],
    [{ id: 'request', searchNow: true }, true],
    [{ id: 'request', searchNow: false }, false],
  ]) {
    const request = endpoint.query(arg);
    assert.equal(request.url, '/trip-requests/request/release-driver');
    assert.equal(request.method, 'PUT');
    assert.deepEqual(request.body, { searchNow });
    assert.deepEqual(endpoint.invalidatesTags(undefined, undefined, arg)[0], { type: 'TripRequest', id: 'request' });
  }
});

test('overdue actions distinguish a thirty-minute search from schedule editing', async () => {
  const hooks = hookHarness(), dialogs = [], requests = [], routes = [];
  const load = loader({ react: hooks.react, '@/store/api/tripRequestApi': {},
    '@/components/ui/DialogProvider': {},
    '@/utils/errorHelpers': { getApiErrorMessage: () => 'failure' },
    '@/utils/notificationNavigation': { extractTripRequestId: data => data.tripRequestId },
    '@/utils/requestNavigation': { getTripRequestDetailHref: (id, options) => ({ id, ...options }) } });
  const useRecovery = load('hooks/notifications/useOverdueRequestNotification.ts').useOverdueRequestNotification;
  const flow = hooks.render(() => useRecovery({
    pathnameRef: { current: '/' },
    activeOverdueAccountIdRef: { current: null }, activeOverdueRequestIdRef: { current: null },
    currentUserRef: { current: { id: 'passenger' } }, shownOverdueRequestsRef: { current: new Set() },
    showDialog: dialog => dialogs.push(dialog), router: { push: route => routes.push(route) },
    releaseOverdueDriver: body => ({ unwrap: async () => { requests.push(body); } }), refetchMyTripRequests() {},
  }));
  flow.presentPassengerOverdueModal({ id: 'request', passengerId: 'passenger', status: 'driver_selected',
    selectedDriverId: 'driver', driverPickupOverdueNotifiedAt: new Date().toISOString(),
    departureDateMax: new Date(Date.now() - 60000).toISOString() });
  await dialogs[0].actions[1].onPress();
  await dialogs[0].actions[2].onPress();
  assert.deepEqual(requests, [{ id: 'request', searchNow: true }, { id: 'request', searchNow: false }]);
  assert.deepEqual(routes.map(route => route.editSchedule), [false, true]);
  hooks.unmount();
});
