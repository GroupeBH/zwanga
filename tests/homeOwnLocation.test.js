const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', Image: 'Image',
  StyleSheet: { create: value => value }, Platform: { OS: 'android' } };
const load = loader({ 'react-native': native,
  'react-native-maps': { __esModule: true, default: 'Map', Marker: 'Marker' },
  '@/assets/images/map-markers/user-location-marker.png': 1 });
const { HomeMap } = load('components/home/HomeMap.tsx');
function nodes(node) {
  return Array.isArray(node) ? node.flatMap(nodes) : React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
}
test('Home renders zero or one static own-position marker, regardless of other users or active rides', () => {
  const props = { shouldRenderHomeMap: true, userCoordinate: { latitude: -4.33, longitude: 15.3 },
    tripsWithMapCoordinates: Array(50).fill({}), tripRequestsWithMapCoordinates: Array(50).fill({}),
    visibleDriverPassengerMarkers: Array(50).fill({}), ongoingDriverTrip: { id: 'active' } };
  const tree = HomeMap.type(props), markers = nodes(tree).filter(n => n.type === 'Marker');
  assert.equal(markers.length, 1);
  assert.equal(markers[0].props.coordinate, props.userCoordinate);
  assert.equal(markers[0].props.image, 1);
  assert.equal(markers[0].props.tracksViewChanges, false);
  assert.equal(markers[0].props.children, undefined);
  assert.equal(tree.props.showsUserLocation, false, 'no second native location subscription');
  assert.ok(tree.props.mapPadding.bottom > 24, 'map attribution clears the rounded panel overlap');
  assert.equal(nodes(HomeMap.type({ ...props, userCoordinate: null })).filter(n => n.type === 'Marker').length, 0);
  assert.equal(nodes(HomeMap.type({ ...props, shouldRenderHomeMap: false })).some(n => n.type === 'Map'), false);
});

function favoriteFixture() {
  const hooks = hookHarness(), calls = [], routes = [];
  let resolve, reject;
  const loadFavorites = (...args) => { calls.push(args); return { unwrap: () => new Promise((yes, no) => { resolve = yes; reject = no; }) }; };
  const { useHomeFavoriteShortcut } = loader({ react: hooks.react,
    '@/store/api/userApi': { useLazyGetFavoriteLocationsQuery: () => [loadFavorites] },
  })('hooks/home/useHomeFavoriteShortcut.ts');
  const props = { userId: 'test-account', isScreenActive: true, router: { push: route => routes.push(route) } };
  return { hooks, calls, routes, props, resolve: value => resolve(value), reject: () => reject(Error('offline')),
    render: () => hooks.render(() => useHomeFavoriteShortcut(props)) };
}
const favorite = extra => ({ type: 'home', address: 'Adresse de test', name: 'Maison',
  coordinates: { latitude: -4.33, longitude: 15.32 }, ...extra });
test('saved destinations load only on tap, coalesce rapid taps and prefill search from the default address', async () => {
  const app = favoriteFixture(); app.render();
  assert.deepEqual(app.calls, []);
  const job = app.render().openFavorite('home');
  await app.render().openFavorite('work');
  assert.equal(app.calls.length, 1); assert.equal(app.calls[0][1], true);
  assert.equal(app.render().pending, 'home');
  app.resolve([favorite(), favorite({ isDefault: true, address: 'Adresse par défaut' })]); await job;
  assert.equal(app.routes[0].pathname, '/search');
  assert.equal(app.routes[0].params.arrival, 'Adresse par défaut');
  assert.equal(app.routes[0].params.arrivalRadiusKm, '5');
  assert.equal(app.render().pending, null);
  app.hooks.unmount();
});
test('missing favorites open address management; unavailable reads show inline retryable feedback', async () => {
  const app = favoriteFixture();
  let job = app.render().openFavorite('home'); app.resolve([]); await job;
  assert.deepEqual(app.routes, ['/favorite-locations']);
  job = app.render().openFavorite('work'); app.reject(); await job;
  assert.match(app.render().error, /Adresses indisponibles/); assert.equal(app.render().pending, null);
  assert.equal(app.routes.length, 1);
  job = app.render().openFavorite('work'); app.resolve([favorite({ type: 'work', coordinates: { latitude: NaN, longitude: 15 } })]); await job;
  assert.equal(app.routes[1].params.arrival, 'Adresse de test');
  assert.equal(app.routes[1].params.mode, undefined, 'invalid coordinates cannot reach map search');
  app.hooks.unmount();
});
for (const interruption of ['blur', 'account', 'unmount']) {
  test(`late address result cannot navigate after ${interruption}`, async () => {
    const app = favoriteFixture(), job = app.render().openFavorite('home');
    if (interruption === 'unmount') app.hooks.unmount();
    else { if (interruption === 'blur') app.props.isScreenActive = false; else app.props.userId = 'another-account'; app.render(); }
    app.resolve([favorite()]); await job;
    assert.deepEqual(app.routes, []);
    if (interruption !== 'unmount') app.hooks.unmount();
  });
}
test('suggestion cards retain honest price units and route to existing confirmation flows, not direct mutations', () => {
  const { HomeSuggestionCard } = load('components/home/HomeSuggestionCard.tsx');
  const trip = { id: 'trip', driverName: 'Test', driverRating: 4, availableSeats: 2, price: 1450,
    departureTime: new Date().toISOString(), departure: { name: 'Départ' }, arrival: { name: 'Arrivée' } };
  const routes = [];
  const tree = HomeSuggestionCard.type({ item: { kind: 'trip', trip, isBooked: false }, onOpen: id => routes.push(id) });
  tree.props.onPress(); assert.deepEqual(routes, ['trip']);
  const texts = nodes(tree).filter(n => n.type === 'Text').map(n => n.props.children);
  assert.ok(texts.includes('/ place')); assert.ok(texts.includes('Réserver')); assert.ok(texts.includes('Test'));
  const request = { id: 'request', numberOfSeats: 1, maxPricePerSeat: 0, departure: trip.departure, arrival: trip.arrival };
  const client = HomeSuggestionCard.type({ item: { kind: 'request', request }, onOpen: id => routes.push(id) });
  const labels = nodes(client).filter(n => n.type === 'Text').map(n => n.props.children);
  assert.ok(labels.includes('À discuter')); assert.ok(labels.includes('Voir'));
  client.props.onPress(); assert.deepEqual(routes, ['trip', 'request']);
});
