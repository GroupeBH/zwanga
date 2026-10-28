const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const elements = tree => Array.isArray(tree) ? tree.flatMap(elements) : React.isValidElement(tree)
  ? [tree, ...elements(tree.props.children)] : [];
const words = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree)
  ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', StyleSheet: { create: x => x } };

function screenFixture() {
  const hooks = hookHarness(), reads = [], gps = [];
  const now = Date.now();
  const model = { userId: 'owner', isScreenActive: true, tripRequest: { id: 'request', passengerId: 'owner', status: 'pending',
    vehicleType: 'car', numberOfSeats: 1, maxPricePerSeat: 2500, departureDateMin: new Date(now + 600000).toISOString(),
    departureDateMax: new Date(now + 1200000).toISOString() } };
  const state = { online: true, error: false, data: { requestId: 'request', searching: true, generatedAt: new Date(now).toISOString(),
    total: 3, vehicles: Array.from({ length: 3 }, (_, i) => ({ id: `vehicle-${i}`, latitude: -4.3, longitude: 15.3 + i / 10000,
      vehicleType: 'car', positionUpdatedAt: new Date(now).toISOString() })) } };
  const Screen = loader({ react: { ...React, ...hooks.react }, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/store/hooks': { useAppSelector: fn => fn({ zwangaApi: { config: { online: state.online } } }) },
    '@/hooks/useUserLocation': { useUserLocation: options => { gps.push(options); return { lastKnownLocation: null }; } },
    '@/store/api/requestSearchApi': { useGetRequestSearchMapQuery: (id, options) => { reads.push({ id, options });
      return { currentData: options.skip ? undefined : state.data, fulfilledTimeStamp: now, isError: state.error, refetch: async () => ({ data: state.data }) }; } },
    '@/hooks/useRouteLocationLabels': { useRouteLocationLabels: () => ({ departure: { title: 'Départ de test' }, arrival: { title: 'Arrivée de test' } }) },
    './RequestSearchMap': { RequestSearchMap: 'Map' }, './RequestOwnerModals': { RequestOwnerModals: 'Editor' },
    './RequestTargetDriver': { RequestTargetDriver: 'Target' }, './SharedTripPanel': { SharedTripPanel: 'Sharing' },
    './RequestPassengerTicket': { RequestPassengerActions: 'Actions', formatRequestDay: () => 'Aujourd’hui', formatRequestTime: () => '12:00' },
    '@/hooks/request-detail/useRequestResponseWindow': { useRequestResponseWindow: () => ({}) },
  })('features/request-detail/RequestSearchScreen.tsx').RequestSearchScreen;
  return { state, model, reads, gps, hooks, render: () => hooks.render(() => Screen({ model, presentation: {
    requestRouteMapData: { departureCoordinate: { latitude: -4.3, longitude: 15.3 } } }, onLayout() {} })) };
}

test('search screen exposes real drivers, route, price and existing actions outside the scrolling panel', t => {
  const app = screenFixture(); t.after(() => app.hooks.unmount());
  const tree = app.render();
  assert.match(words(tree), /3 véhicules sur la carte/);
  assert.match(words(tree), /2 500 FC \/ place/);
  assert.match(words(tree), /Dernières positions connues/);
  assert.equal(elements(tree).find(node => node.type === 'Map').props.vehicles.length, 3);
  const scroll = elements(tree).find(node => node.type === 'ScrollView');
  assert.ok(elements(scroll).some(node => node.type === 'Sharing'), 'shared ride consent is still accessible');
  assert.equal(elements(scroll).some(node => node.type === 'Actions'), false);
  assert.ok(elements(tree).some(node => node.type === 'Actions'));
  assert.equal(app.reads.at(-1).options.pollingInterval, 30000);
});

test('older positions and rendering limits are explained without claiming live availability', t => {
  const app = screenFixture(); t.after(() => app.hooks.unmount());
  app.state.data.vehicles[0].positionUpdatedAt = new Date(Date.now() - 3600000).toISOString();
  app.state.data.truncated = true;
  const tree = app.render();
  assert.match(words(tree), /les plus proches/);
  assert.match(words(tree), /Les véhicules plus pâles ont une position ancienne/);
});

test('old backend grid-only responses never fabricate individual vehicle positions', t => {
  const app = screenFixture(); t.after(() => app.hooks.unmount());
  app.state.data.vehicles = undefined;
  app.state.data.groups = [{ id: 'cell', latitude: -4.3, longitude: 15.3, count: 3 }];
  const tree = app.render();
  assert.match(words(tree), /Positions indisponibles/);
  assert.deepEqual(elements(tree).find(node => node.type === 'Map').props.vehicles, []);
  assert.ok(elements(tree).some(node => node.type === 'Actions'));
});

test('search reads stop offline; GPS and native map stop when hidden or editing, without inventing drivers', t => {
  const app = screenFixture(); t.after(() => app.hooks.unmount()); app.render();
  app.state.data = undefined; app.state.error = true;
  assert.match(words(app.render()), /Votre demande reste enregistrée/);
  app.state.online = false; app.render();
  assert.equal(app.reads.at(-1).options.skip, true);
  app.state.online = true; app.model.isScreenActive = false;
  let tree = app.render();
  assert.equal(app.reads.at(-1).options.pollingInterval, 0);
  assert.equal(app.gps.at(-1).autoRequest, false);
  assert.equal(elements(tree).find(node => node.type === 'Map').props.active, false);
  app.model.isScreenActive = true; app.model.showEditForm = true; tree = app.render();
  assert.equal(app.reads.at(-1).options.skip, true);
  assert.equal(elements(tree).find(node => node.type === 'Map').props.active, false);
});
