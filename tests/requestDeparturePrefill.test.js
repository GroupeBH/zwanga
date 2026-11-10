const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { getTripRequestCreateHref, getRequestDepartureSelection, getRequestArrivalSelection } = loader()('utils/requestNavigation.ts');

test('destination shortcuts roundtrip exact coordinates without replacing the GPS pickup', () => {
  const point = { title: 'Destination choisie', address: 'Rue test', latitude: -4.31, longitude: 15.21 };
  const route = getTripRequestCreateHref({ entry: 'home', arrivalLocation: point });
  assert.deepEqual(getRequestArrivalSelection(route.params), point);
  assert.equal(getRequestDepartureSelection(route.params), null);
  for (const params of [{}, { arrivalLat: '', arrivalLng: '' }, { arrivalLat: '-4.3', arrivalLng: '999' },
    { arrivalLat: ['-4.3'], arrivalLng: '15.3' }, { arrivalLat: 'NaN', arrivalLng: '15.3' }]) {
    assert.equal(getRequestArrivalSelection(params), null);
  }
});

test('confirmed departure coordinates roundtrip without becoming a destination', () => {
  const location = { title: 'Départ choisi', address: 'Rue du test', latitude: -4.300123, longitude: 15.210456 };
  const href = getTripRequestCreateHref({ departureLocation: location });
  assert.equal(href.pathname, '/request-create');
  assert.equal(href.params.arrival, undefined);
  assert.deepEqual(getRequestDepartureSelection(href.params), location);
  assert.deepEqual(getTripRequestCreateHref(), { pathname: '/request-create' });
  assert.deepEqual(getTripRequestCreateHref({ departure: ' Test ', arrival: ' Fin ', seats: 2 }), {
    pathname: '/request-create', params: { departure: 'Test', arrival: 'Fin', seats: '2' },
  });
});

test('missing, malformed and out-of-area coordinates never become a confirmed map location', () => {
  for (const params of [{}, { departureLat: '', departureLng: '' }, { departureLat: 'NaN', departureLng: '15.3' },
    { departureLat: '-4.3', departureLng: '999' }, { departureLat: ['-4.3'], departureLng: '15.3' }]) {
    assert.equal(getRequestDepartureSelection(params), null);
  }
});

test('real order prefill preserves the confirmed point, opens arrival and does not fetch GPS', () => {
  const hooks = hookHarness(); let gps = 0;
  const load = loader({ react: hooks.react,
    '@/utils/currentLocationSelection': { buildCurrentLocationSelection: async () => { throw Error('GPS must not replace the shortcut'); } },
  });
  const { useRequestRoutePrefill } = load('hooks/trip-request/useRequestRoutePrefill.ts');
  const point = { title: 'Lieu confirmé', address: 'Rue test', latitude: -4.3, longitude: 15.3 };
  const state = { departureLocation: null, arrivalLocation: null, departureManualAddress: '', arrivalManualAddress: '',
    hasAppliedRoutePrefill: false, addressInputMode: 'manual', addressSectionStep: 'method' };
  const refs = { screenMountedRef: { current: true }, departureTouchedRef: { current: false }, departureAutoFillStartedRef: { current: false } };
  const setters = Object.fromEntries(Object.keys(state).map(key => [`set${key[0].toUpperCase()}${key.slice(1)}`, value => { state[key] = value; }]));
  const props = { ...refs, ...setters, routeCoordinates: [], favoriteLocations: [],
    requestParams: getTripRequestCreateHref({ departureLocation: point }).params,
    getCurrentLocation: async () => { gps++; return null; }, setNumberOfSeats() {}, setRequestFormStep() {},
    lastKnownLocation: { coords: { latitude: -4.4, longitude: 15.4 }, timestamp: Date.now() },
  };
  const render = () => hooks.render(() => useRequestRoutePrefill({ ...props, ...state }));
  render(); render();
  assert.deepEqual(state.departureLocation, point);
  assert.equal(state.departureManualAddress, point.title); assert.equal(state.arrivalLocation, null);
  assert.equal(state.addressInputMode, 'map'); assert.equal(state.addressSectionStep, 'arrival');
  assert.equal(refs.departureTouchedRef.current, true); assert.equal(gps, 0);
  state.departureLocation = { ...point, latitude: -4.31 }; render();
  assert.equal(state.departureLocation.latitude, -4.31, 'prefill is applied once, not over subsequent user edits');
  hooks.unmount();
});
