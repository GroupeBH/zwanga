const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };
const departure = { latitude: -4.33, longitude: 15.28 }, arrival = { latitude: -4.5, longitude: 15.45 };
const model = { TRIP_DETAIL_MAP_MIN_DELTA: 0.006, TRIP_DETAIL_MAP_PADDING: 1.02,
  DEFAULT_MAP_REGION: { latitude: -4.3, longitude: 15.3, latitudeDelta: 0.12, longitudeDelta: 0.12 },
  isValidMapCoordinate: point => Boolean(point && Number.isFinite(point.latitude) && Number.isFinite(point.longitude)),
};
function presentation(routeCoordinates, extra = {}) {
  const hooks = hookHarness();
  const hook = loader({ react: hooks.react, '../../features/trip-detail/tripDetailModel': model,
    './useTripDetailArrivalEstimate': { useTripDetailArrivalEstimate() {} },
  })('hooks/trip-detail/useTripDetailMapPresentation.ts').useTripDetailMapPresentation;
  const result = hooks.render(() => hook({ isScreenActive: true, trip: { id: 'trip', status: 'upcoming' },
    departureCoordinate: departure, arrivalCoordinate: arrival, hasValidRouteEndpoints: true,
    routeCoordinates, progress: 0, liveDriverCoordinate: null, ...extra }));
  hooks.unmount(); return result;
}

test('the preview frames both ends and road bends, including long routes previously cropped', () => {
  const points = [departure, { latitude: -4.25, longitude: 15.6 }, arrival];
  const result = presentation(points), region = result.mapRegion;
  assert.equal(result.hasDetailedRouteMapCoordinates, true);
  for (const point of points) {
    assert.ok(Math.abs(point.latitude - region.latitude) < region.latitudeDelta / 2);
    assert.ok(Math.abs(point.longitude - region.longitude) < region.longitudeDelta / 2);
  }
  assert.ok(region.latitudeDelta > 0.014);
  assert.deepEqual(result.routeMapCoordinates, points);
});

test('missing, invalid and two-point routes stay honest fallbacks; invalid endpoints use safe region', () => {
  for (const points of [null, [], [departure, arrival], [departure, { latitude: NaN, longitude: 15 }, arrival]]) {
    const result = presentation(points);
    assert.equal(result.hasDetailedRouteMapCoordinates, false);
    assert.deepEqual(result.routeMapCoordinates, [departure, arrival]);
  }
  assert.deepEqual(presentation(null, { hasValidRouteEndpoints: false }).mapRegion, model.DEFAULT_MAP_REGION);
  assert.deepEqual(presentation(null, { hasValidRouteEndpoints: false }).routeMapCoordinates, []);
});

test('native preview geometry is bounded, preserving endpoints', () => {
  const points = Array.from({ length: 9000 }, (_, i) => ({ latitude: -4.3 - i / 100000, longitude: 15.3 + i / 100000 }));
  const result = presentation(points);
  assert.equal(result.routeMapCoordinates.length, 512);
  assert.deepEqual(result.routeMapCoordinates[0], points[0]);
  assert.deepEqual(result.routeMapCoordinates.at(-1), points.at(-1));
  assert.equal(presentation(Array(10001).fill(departure)).hasDetailedRouteMapCoordinates, false);
});

test('owner map gains space while passenger heights and small-screen bounds are preserved', () => {
  const { tripDetailMapHeight } = loader()('features/trip-detail/tripDetailLayout.ts');
  for (const height of [568, 700, 844, 1200]) {
    assert.equal(tripDetailMapHeight(height, false), Math.min(214, Math.max(172, height * 0.27)));
    assert.ok(tripDetailMapHeight(height, true) > tripDetailMapHeight(height, false));
    assert.ok(tripDetailMapHeight(height, true) <= 320);
  }
  assert.ok(Number.isFinite(tripDetailMapHeight(NaN, true)));
});

test('changing trip clears the previous trace, ignores stale response and exposes road failure safely', async () => {
  const hooks = hookHarness(), pending = [], state = {};
  const hook = loader({ react: hooks.react, '../../features/trip-detail/tripDetailModel': model,
    '@/utils/routeApi': { getRouteInfo: () => new Promise((resolve, reject) => pending.push({ resolve, reject })) },
  })('hooks/trip-detail/useTripDetailRouteCoordinates.ts').useTripDetailRouteCoordinates;
  const props = { isScreenActive: true, trip: { id: 'first', departure: { lat: departure.latitude, lng: departure.longitude },
    arrival: { lat: arrival.latitude, lng: arrival.longitude }, departureTime: '2030-01-01T12:00:00Z' },
    setRouteCoordinates: value => { state.coordinates = value; }, setRouteInfo: value => { state.info = value; },
    setCalculatedArrivalTime: value => { state.arrival = value; }, setIsLoadingRoute: value => { state.loading = value; },
  };
  hooks.render(() => hook(props));
  props.trip = { ...props.trip, id: 'second' }; hooks.render(() => hook(props));
  pending[0].resolve({ coordinates: [departure, arrival], duration: 60 }); await settle();
  assert.deepEqual(state, { coordinates: null, info: null, arrival: null, loading: true });
  pending[1].reject(Error('offline')); await settle();
  assert.deepEqual(state, { coordinates: [departure, arrival], info: null, arrival: null, loading: false });
  props.trip = { ...props.trip, id: 'third' }; hooks.render(() => hook(props));
  const info = { coordinates: [departure, { latitude: -4.4, longitude: 15.5 }, arrival], duration: 600, distance: 3000 };
  pending[2].resolve(info); await settle();
  assert.deepEqual(state.coordinates, info.coordinates); assert.equal(state.info, info);
  assert.equal(state.arrival.toISOString(), '2030-01-01T12:10:00.000Z'); assert.equal(state.loading, false);
  hooks.unmount();
});
