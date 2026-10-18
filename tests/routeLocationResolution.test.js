const test = require('node:test');
const assert = require('node:assert/strict');
const { skipToken } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { getRouteLocationLabels, getRouteTitle, getRouteStopLabel, getRouteLocationCoordinates } = loader()('utils/routeLocationLabels.ts');

const arrival = Object.freeze({ name: 'H8XW+6XG', address: 'H8XW+6XG', lat: -4.38, lng: 15.32, hasCoordinates: true, reference: 'Portail bleu' });
const trip = Object.freeze({ departure: Object.freeze({ name: 'Botango', address: 'Botango' }), arrival, price: 0 });
const response = Object.freeze({ formattedAddress: 'J83F+5G4, Av. Bakole 1, Kinshasa', lat: -4.3801, lng: 15.3201 });

function environment() {
  const hooks = hookHarness();
  const reads = [];
  let active = true;
  let state = { isFetching: true };
  const { useRouteLocationLabels } = loader({
    react: hooks.react,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/store/api/googleMapsApi': { useGetRouteLocationAddressQuery: (args, options) => {
      reads.push({ args, options });
      return args === skipToken ? {} : state;
    } },
  })('hooks/useRouteLocationLabels.ts');
  return {
    render: (value = trip, enabled = true) => { reads.length = 0; return hooks.render(() => useRouteLocationLabels(value, enabled)); },
    setState: value => { state = value; },
    setActive: value => { active = value; },
    reads,
    unmount: hooks.unmount,
  };
}

test('the screenshot resolves a code-only saved destination without mutating the trip or its coordinates', () => {
  const env = environment();
  const before = JSON.stringify(trip);
  const pending = env.render();
  assert.equal(getRouteTitle(pending), 'Départ : Botango');
  assert.equal(pending.arrival.title, 'Recherche de l’adresse…');
  assert.equal(pending.arrival.isResolved, false);
  assert.equal(env.reads[0].args, skipToken, 'no request for the already readable departure');
  assert.deepEqual(env.reads[1].args, { lat: arrival.lat, lng: arrival.lng, language: 'fr', region: 'cd' });
  const args = env.reads[1].args;
  env.setState({ currentData: response, isFetching: false });
  const resolved = env.render();
  assert.equal(getRouteTitle(resolved), 'Botango vers Av. Bakole 1');
  assert.equal(resolved.arrival.context, 'Kinshasa');
  assert.equal(resolved.arrival.reference, 'Portail bleu');
  assert.equal(resolved.arrival.isResolved, true);
  assert.equal(JSON.stringify(trip), before);
  assert.strictEqual(env.reads[1].args, args, 'the same point keeps a stable cache key after resolving');
  assert.strictEqual(env.render({ ...trip, price: 9000, currentLocation: { lat: -4.4, lng: 15.4 } }), resolved);
  assert.equal(env.reads[1].options.pollingInterval, 0);
  assert.equal(env.reads[1].options.refetchOnFocus, false);
  assert.equal(env.reads[1].options.refetchOnMountOrArgChange, false);
  assert.equal(env.reads[1].options.refetchOnReconnect, true);
  env.unmount();
});

test('structured reverse geocoding can recover the street even when its formatted text only contains a code', () => {
  const env = environment();
  env.setState({ currentData: { ...response, formattedAddress: 'H8XW+6XG', addressComponents: [
    { longName: 'Kinshasa', types: ['locality'] }, { longName: 'Avenue Matadi', types: ['route'] },
    { longName: '3b', types: ['street_number'] },
  ] } });
  assert.equal(env.render().arrival.title, '3b Avenue Matadi');
});

test('a result from the previous endpoint cannot rename the next route, or overwrite a new readable selection', () => {
  const env = environment();
  env.setState({ currentData: response });
  assert.equal(env.render().arrival.isResolved, true);
  env.setState({ data: response, currentData: undefined, isFetching: true });
  const changed = { ...trip, arrival: { ...arrival, lat: -4.45, lng: 15.26 } };
  const next = env.render(changed);
  assert.equal(next.arrival.isResolved, false);
  assert.equal(getRouteTitle(next), 'Départ : Botango');
  assert.equal(env.reads[1].args.lat, -4.45);
  env.setState({ currentData: response, isFetching: false });
  const chosen = env.render({ ...trip, arrival: { ...arrival, name: 'Maison', address: 'Maison' } });
  assert.equal(chosen.arrival.title, 'Maison');
  assert.equal(env.reads[1].args, skipToken, 'an explicit readable name takes priority over a late result');
});

test('known names require no request and user references remain intact, including gate codes', () => {
  const env = environment();
  env.setState({ currentData: response });
  const next = env.render({ ...trip, arrival: { ...arrival, reference: 'HF6ZT7E' } });
  assert.equal(next.arrival.reference, 'HF6ZT7E');
  const known = env.render({ ...trip, arrival: { ...arrival, name: 'Maison', address: 'Av. Bakole 1, Kinshasa' } });
  assert.equal(known.arrival.title, 'Maison');
  assert.ok(env.reads.every(({ args }) => args === skipToken));
});

test('missing, non-finite, out-of-range and mapper fallback coordinates never trigger geocoding', () => {
  for (const invalid of [{}, { lat: NaN, lng: 15 }, { lat: -4, lng: Infinity }, { lat: 91, lng: 15 },
    { lat: -4, lng: -181 }, { lat: 0, lng: 0 }, { lat: '-4', lng: 15 }, { ...arrival, hasCoordinates: false }]) {
    const env = environment();
    const result = env.render({ ...trip, arrival: { name: 'H8XW+6XG', ...invalid } });
    assert.equal(env.reads[1].args, skipToken);
    assert.equal(result.arrival.isResolved, false);
    assert.equal(result.arrival.title, 'Nom du lieu indisponible');
    assert.doesNotMatch(result.arrival.context, /conservée/);
  }
  assert.deepEqual(getRouteLocationCoordinates({ lat: 0, lng: 15 }), { lat: 0, lng: 15 });
  assert.deepEqual(getRouteLocationCoordinates({ lat: -4, lng: 0 }), { lat: -4, lng: 0 });
});

test('offline or unusable provider results keep a nonblocking honest fallback, without exposing technical errors', () => {
  for (const state of [
    { isFetching: false, error: { status: 'FETCH_ERROR', error: 'aborted server error' } },
    { currentData: { ...response, formattedAddress: 'H8XW+6XG' }, isFetching: false },
    { currentData: { ...response, formattedAddress: '' }, isFetching: false },
  ]) {
    const env = environment();
    env.setState(state);
    const result = env.render();
    assert.equal(getRouteTitle(result), 'Départ : Botango');
    assert.equal(result.arrival.title, 'Nom du lieu indisponible');
    assert.equal(result.arrival.context, 'La position du lieu est conservée.');
    assert.equal(result.arrival.reference, 'Portail bleu');
    assert.doesNotMatch(JSON.stringify(result), /aborted|FETCH_ERROR|H8XW/);
  }
});

test('background/unfocused screens and hidden edit forms do not start or subscribe to address reads', () => {
  const env = environment();
  env.setActive(false);
  assert.equal(env.render().arrival.title, 'Nom du lieu indisponible');
  assert.ok(env.reads.every(({ options }) => options.skip));
  env.setActive(true);
  env.render(trip, false);
  assert.ok(env.reads.every(({ options }) => options.skip));
  env.render();
  assert.equal(env.reads[1].options.skip, false);
  env.unmount();
});

test('old generic placeholders also qualify for resolution, while a real name does not', () => {
  for (const name of ['Destination', 'Point sélectionné', 'Ma position', 'Adresse non disponible',
    'Position exacte enregistrée sur la carte', 'H8XW+6XG']) {
    const env = environment();
    env.render({ ...trip, arrival: { ...arrival, name, address: name } });
    assert.notEqual(env.reads[1].args, skipToken);
  }
  assert.equal(getRouteStopLabel({ name: 'Ma position', address: 'Av. Bakole 1, Kinshasa' }).title, 'Av. Bakole 1');
});

test('route headings never combine a known origin with a fake destination name', () => {
  assert.equal(getRouteTitle(getRouteLocationLabels(trip)), 'Départ : Botango');
  assert.equal(getRouteTitle(getRouteLocationLabels({ arrival: { name: 'UPN' } })), 'Destination : UPN');
  assert.equal(getRouteTitle(getRouteLocationLabels()), 'Itinéraire du trajet');
});
