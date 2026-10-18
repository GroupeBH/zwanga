const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const noop = () => {};
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { resolve, promise }; };

function picker(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(), reads = [], pending = deferred();
  const permission = { value: Promise.resolve({ status: 'granted' }) };
  const { useLocationPicker } = loader({ react: hooks.react, 'react-native': { Keyboard: { dismiss: noop } },
    'expo-location': { Accuracy: { Balanced: 3 }, requestForegroundPermissionsAsync: () => permission.value,
      getLastKnownPositionAsync: async () => null, getCurrentPositionAsync: options => { reads.push(options); return pending.promise; } },
    '@/utils/googleMapsPlaces': { searchGoogleMapsPlaces: async () => [], getGoogleMapsPlaceDetails: async () => null },
    '@/store': { store: {} },
    '@/store/api/googleMapsApi': { useGeocodeMutation: () => [noop], useReverseGeocodeMutation: () => [noop] },
  })('hooks/location-picker/useLocationPicker.ts');
  const props = { initialLocation: { latitude: -4.32, longitude: 15.32, title: 'Test' }, onSelect: noop, onClose: noop };
  const render = () => hooks.render(() => useLocationPicker(props));
  t.after(() => hooks.unmount());
  return { hooks, reads, pending, permission, render };
}

test('three picker timeouts share ONE native fix and a late fix cannot change a manual choice', async t => {
  const f = picker(t);
  for (let i = 0; i < 3; i++) {
    const work = f.render().locate(); await tick();
    t.mock.timers.tick(10_000); await work;
    assert.equal(f.render().locating, false);
    assert.match(f.render().notice, /indisponible/);
  }
  assert.equal(f.reads.length, 1);
  f.render().choose({ latitude: -4.4, longitude: 15.4, title: 'Choix manuel' });
  f.pending.resolve({ coords: { latitude: -4.31, longitude: 15.31 } }); await tick();
  assert.equal(f.render().selection.title, 'Choix manuel');
});

test('closing the picker immediately releases a native GPS waiter', async t => {
  const f = picker(t), work = f.render().locate(); await tick();
  f.render().close(); f.hooks.unmount(); await work;
  assert.equal(f.reads.length, 1);
  f.pending.resolve({ coords: { latitude: -4.31, longitude: 15.31 } }); await tick();
});

function passenger(t, granted = true) {
  const hooks = hookHarness(), cache = deferred(), subscriptions = [], samples = [], starts = [];
  const permission = { status: granted ? 'granted' : 'denied' };
  let activity;
  const { usePassengerLocationSharing } = loader({ react: hooks.react,
    'expo-location': { Accuracy: { High: 4 }, requestForegroundPermissionsAsync: async () => ({ ...permission }),
      getForegroundPermissionsAsync: async () => ({ ...permission }),
      getLastKnownPositionAsync: () => cache.promise, getCurrentPositionAsync: () => assert.fail('no independent native GPS fix') },
    'react-native': { AppState: { addEventListener: (_name, callback) => { activity = callback; return { remove() { activity = null; } }; } } },
    '@/services/trackingSocket': { trackingSocket: { resumeBoardingDetection: async () => {} } },
    './rideLocationStream': { subscribeRideLocation: (_key, options, callback) => {
      const sub = { options, callback, removed: false, remove() { this.removed = true; } }; subscriptions.push(sub); return sub;
    } },
    '@/services/passengerBackgroundLocationTask': { startPassengerBackgroundLocationTracking: async id => starts.push(id), stopPassengerBackgroundLocationTracking: async () => {} },
  })('hooks/passenger-navigation/usePassengerLocationSharing.ts');
  const props = { booking: { id: 'synthetic', status: 'accepted', droppedOff: false }, tripId: 'trip', isTripOngoing: true,
    isFocused: true, isMountedRef: { current: true }, isExitingRef: { current: false }, passengerLocationSubscriptionRef: { current: null },
    lastAcceptedPassengerCoordinateRef: { current: null }, lastAcceptedPassengerTimestampRef: { current: null },
    setPassengerLocation: value => samples.push(value), setRecoveryFix: noop, beginLocationRequest: () => null, showDialog: noop };
  const render = () => hooks.render(() => usePassengerLocationSharing(props));
  t.after(() => hooks.unmount());
  return { hooks, props, render, cache, subscriptions, samples, starts, permission, resume: () => activity?.('active') };
}

test('passenger subscribes immediately despite a hung cache; resume never opens a one-shot GPS read', async t => {
  const f = passenger(t); f.render(); await tick();
  assert.equal(f.subscriptions.length, 1); assert.equal(f.starts.length, 1);
  const fix = { timestamp: Date.now(), coords: { latitude: -4.3, longitude: 15.3, accuracy: 5 } };
  f.subscriptions[0].callback(fix);
  assert.equal(f.samples.length, 1);
  f.resume(); await tick();
  assert.equal(f.subscriptions.length, 2);
  assert.equal(f.subscriptions[0].removed, true);
  assert.equal(f.subscriptions[1].removed, false);
  f.cache.resolve({ ...fix, timestamp: fix.timestamp - 30_000 }); await tick();
  assert.equal(f.samples.length, 1);
  f.props.isFocused = false; f.render();
  assert.ok(f.subscriptions.every(s => s.removed));
  f.subscriptions[1].callback({ ...fix, timestamp: Date.now() + 1 });
  assert.equal(f.samples.length, 1);
});

test('refused passenger permission does not subscribe, including after resume', async t => {
  const f = passenger(t, false); f.render(); await tick(); f.resume(); await tick();
  assert.equal(f.subscriptions.length, 0); assert.equal(f.starts.length, 0);
});

test('enabling passenger permission in Settings starts the stream on return without a one-shot read', async t => {
  const f = passenger(t, false); f.render(); await tick();
  f.permission.status = 'granted'; f.resume(); f.resume(); await tick();
  assert.equal(f.subscriptions.length, 1); assert.equal(f.starts.length, 1);
});

function placeReads() {
  const requests = [];
  const endpoint = kind => ({ initiate: args => ({ kind, args }) });
  const googleMapsApi = { endpoints: { placesAutocomplete: endpoint('autocomplete'), placesSearch: endpoint('search'), getPlaceDetails: endpoint('detail') } };
  const store = { dispatch: args => {
    const gate = deferred();
    const request = { ...gate, ...args, aborted: false };
    gate.promise.abort = () => { request.aborted = true; gate.resolve({ error: { status: 'ABORTED' } }); };
    requests.push(request); return gate.promise;
  } };
  const load = loader({ '@/store': { store }, '@/store/api/googleMapsApi': { googleMapsApi } });
  return { requests, ...load('utils/googleMapsPlaces.ts') };
}

test('cancelling a Places search aborts both reads; a subsequent identical search can restart', async () => {
  const f = placeReads(), abort = new AbortController();
  const work = f.searchGoogleMapsPlaces('Universite de Kinshasa', undefined, 5, abort.signal);
  assert.equal(f.requests.length, 2); abort.abort();
  assert.deepEqual(await work, []);
  assert.ok(f.requests.every(r => r.aborted));
  const nextAbort = new AbortController();
  const next = f.searchGoogleMapsPlaces('Universite de Kinshasa', undefined, 5, nextAbort.signal);
  await tick(); assert.equal(f.requests.length, 4); nextAbort.abort(); await next;
});

test('one Places consumer cannot cancel another using the same cached query', async () => {
  const f = placeReads(), first = new AbortController(), second = new AbortController();
  const a = f.searchGoogleMapsPlaces('Gombe', undefined, 5, first.signal);
  const b = f.searchGoogleMapsPlaces('Gombe', undefined, 5, second.signal);
  const count = f.requests.length;
  first.abort(); await a;
  assert.ok(f.requests.every(r => !r.aborted));
  for (const r of f.requests) r.resolve({ data: [] });
  assert.deepEqual(await b, []); assert.equal(f.requests.length, count);
});

test('details are cancellable and pre-cancelled searches dispatch nothing', async () => {
  const f = placeReads(), abort = new AbortController();
  const detail = f.getGoogleMapsPlaceDetails('synthetic-place', abort.signal);
  abort.abort(); assert.equal(await detail, null); assert.equal(f.requests[0].aborted, true);
  await f.searchGoogleMapsPlaces('Gombe', undefined, 5, abort.signal);
  await f.getGoogleMapsPlaceDetails('synthetic-place', abort.signal);
  assert.equal(f.requests.length, 1);
});

test('different typed queries sharing the same effective text search cannot cancel each other', async () => {
  const f = placeReads(), first = new AbortController(), second = new AbortController();
  const proximity = { latitude: -4.325, longitude: 15.322 };
  const a = f.searchGoogleMapsPlaces('Avenue de la Paix', proximity, 5, first.signal);
  const b = f.searchGoogleMapsPlaces('Avenue de la Paix, Kinshasa', proximity, 5, second.signal);
  assert.equal(f.requests.filter(r => r.kind === 'search').length, 1);
  first.abort(); await a;
  assert.equal(f.requests.find(r => r.kind === 'search').aborted, false);
  for (const request of f.requests) request.resolve({ data: [] });
  assert.deepEqual(await b, []);
});

test('actual RTK transport receives aborts for replaced searches and preserves a shared caller', async t => {
  const { createApi } = require('@reduxjs/toolkit/query');
  const { configureStore } = require('@reduxjs/toolkit');
  const requests = [];
  const baseApi = createApi({ reducerPath: 'placesTest', endpoints: () => ({}), baseQuery: (arg, api) => {
    const gate = deferred(); requests.push({ ...gate, arg, signal: api.signal });
    api.signal.addEventListener('abort', () => gate.resolve({ error: { status: 'FETCH_ERROR' } }), { once: true });
    return gate.promise;
  } });
  const googleMapsApi = loader({ './baseApi': { baseApi } })('store/api/googleMapsApi.ts').googleMapsApi;
  const store = configureStore({ reducer: { [baseApi.reducerPath]: baseApi.reducer },
    middleware: getDefault => getDefault().concat(baseApi.middleware) });
  t.after(() => store.dispatch(baseApi.util.resetApiState()));
  const places = loader({ '@/store': { store }, '@/store/api/googleMapsApi': { googleMapsApi } })('utils/googleMapsPlaces.ts');
  const first = new AbortController(), second = new AbortController();
  const a = places.searchGoogleMapsPlaces('Universite de Kinshasa', undefined, 5, first.signal);
  const b = places.searchGoogleMapsPlaces('Universite de Kinshasa', undefined, 5, second.signal);
  assert.equal(requests.length, 2); first.abort(); await a;
  assert.ok(requests.every(r => !r.signal.aborted));
  second.abort();
  const third = new AbortController();
  const c = places.searchGoogleMapsPlaces('Universite de Kinshasa', undefined, 5, third.signal);
  await b; await tick();
  assert.equal(requests.length, 4, 'same key starts fresh even immediately after cancelling its previous transport');
  assert.ok(requests.slice(0, 2).every(r => r.signal.aborted));
  assert.ok(requests.slice(2).every(r => !r.signal.aborted));
  third.abort(); await c; assert.ok(requests.every(r => r.signal.aborted));
});
