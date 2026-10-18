const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const modelMock = {
  '../../features/trip-detail/tripDetailModel': {
    arrayToLatLng: value => value ? { latitude: value[1], longitude: value[0] } : null,
    isValidMapCoordinate: value => Boolean(value?.latitude && value?.longitude),
    TRIP_DETAIL_AUTO_PROGRESS_PRIORITY: { pickup_confirmed: 1, dropoff_confirmed: 2 },
  },
};

test('driver detail stops its GPS when covered and resumes once without stopping the native ride task', () => {
  const hooks = hookHarness(), calls = [];
  const { useTripDetailActivity } = loader({ react: hooks.react })('hooks/trip-detail/useTripDetailActivity.ts');
  const props = { isScreenActive: true, tripId: 'trip', trip: { id: 'trip', status: 'ongoing' },
    user: { id: 'driver' }, isTripDriver: true, myBookings: [],
    stopWatchingRef: { current: () => calls.push('stop') }, requestLocationRef: { current: () => calls.push('start') },
    presentedTripDetailAutoProgressKeysRef: { current: new Set() },
    highestTripDetailAutoProgressPriorityRef: { current: new Map() }, tripDetailBookingStateRef: { current: new Map() },
  };
  const render = () => hooks.render(() => useTripDetailActivity({ ...props }));
  assert.equal(render().canTrackTrip, true); render();
  assert.deepEqual(calls, ['start']);
  props.isScreenActive = false;
  assert.equal(render().canTrackTrip, false);
  assert.equal(calls.filter(value => value === 'start').length, 1);
  assert.equal(calls.at(-1), 'stop');
  props.isScreenActive = true; render();
  assert.equal(calls.filter(value => value === 'start').length, 2);
  hooks.unmount(); assert.equal(calls.at(-1), 'stop');
});

test('detail releases every socket listener on blur and ignores a join that finishes afterwards', async () => {
  const hooks = hookHarness(), calls = [], listeners = [];
  let joined;
  const join = new Promise(resolve => { joined = resolve; });
  const subscribe = callback => { listeners.push(callback); calls.push('subscribe'); return () => calls.push('unsubscribe'); };
  const { useTripDetailTracking } = loader({ ...modelMock, react: hooks.react,
    '@/services/trackingSocket': { trackingSocket: {
      joinTrip: () => { calls.push('join'); return join; }, leaveTrip: () => calls.push('leave'),
      requestDriverLocation: () => calls.push('request'), updateDriverLocation: () => calls.push('emit'),
      subscribeToDriverLocation: subscribe, subscribeToErrors: subscribe, subscribeToBookingAutoProgress: subscribe,
    } },
  })('hooks/trip-detail/useTripDetailTracking.ts');
  const props = { isScreenActive: true, trip: { id: 'trip', status: 'ongoing' }, canTrackTrip: true,
    isTripDriver: true, tripBookings: [], tripDetailBookingStateRef: { current: new Map() },
    setTrackingError() {}, setLiveDriverUpdatedAt: () => calls.push('late-state'),
    setLiveDriverCoordinate: () => calls.push('late-state'), lastKnownLocation: null,
  };
  const render = () => hooks.render(() => useTripDetailTracking({ ...props }));
  render(); assert.equal(calls.filter(item => item === 'subscribe').length, 3);
  props.trip = { ...props.trip, availableSeats: 2 };
  props.presentTripDetailAutoProgressEvent = () => calls.push('new-progress-handler');
  props.refetchTrip = props.refetchMyBookings = props.refetchTripBookings = () => calls.push('refresh');
  render();
  assert.equal(calls.filter(item => item === 'join').length, 1);
  listeners[2]({ tripId: 'trip', events: [{ type: 'pickup_confirmed' }] });
  assert.equal(calls.includes('new-progress-handler'), true);
  assert.equal(calls.filter(item => item === 'refresh').length, 3);
  props.isScreenActive = false; render(); joined(); await settle();
  listeners[0]({ tripId: 'trip', coordinates: [15.3, -4.3] });
  assert.equal(calls.filter(item => item === 'unsubscribe').length, 3);
  assert.equal(calls.includes('leave'), true); assert.equal(calls.includes('request'), false);
  assert.equal(calls.includes('late-state'), false); hooks.unmount();
});

test('a late route response cannot update a detail screen that has lost focus', async () => {
  const hooks = hookHarness(), calls = [];
  let resolve;
  const { useTripDetailRouteCoordinates } = loader({ ...modelMock, react: hooks.react,
    '@/utils/routeApi': { getRouteInfo: () => new Promise(yes => { resolve = yes; }) },
  })('hooks/trip-detail/useTripDetailRouteCoordinates.ts');
  const props = { isScreenActive: true, trip: { id: 'trip', departure: { lat: -4.3, lng: 15.3 }, arrival: { lat: -4.4, lng: 15.4 } },
    setRouteCoordinates: () => calls.push('coordinates'), setRouteInfo: () => calls.push('info'),
    setCalculatedArrivalTime: () => calls.push('arrival'), setIsLoadingRoute() {},
  };
  hooks.render(() => useTripDetailRouteCoordinates({ ...props }));
  props.isScreenActive = false; hooks.render(() => useTripDetailRouteCoordinates({ ...props }));
  resolve({ duration: 10, coordinates: [] }); await settle();
  assert.deepEqual(calls, []); hooks.unmount();
});
