const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

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
