const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { pickupSummaryPresentation, pickupMapUrl } = loader()('features/request-detail/requestPickupSummary.ts');
const now = 1_800_000_000_000;
const data = {
  requestId: 'request', generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30000).toISOString(),
  viewerRole: 'driver', status: 'estimated',
  driver: { id: 'driver', name: 'Conducteur', position: null }, passenger: { id: 'passenger', name: 'Passager', position: null },
  vehicle: { brand: 'Toyota', model: 'Vitz', color: 'Bleu', licensePlate: 'TEST' },
  estimate: { distanceMeters: 2400, durationSeconds: 301 },
};
const show = (value = data, id = 'driver', at = now) => pickupSummaryPresentation(value, 'request', id, at);

test('both participants see their counterpart and the same road approach estimate', () => {
  const driver = show();
  const passenger = show({ ...data, viewerRole: 'passenger' }, 'passenger');
  assert.equal(driver.person.id, 'passenger');
  assert.equal(passenger.person.id, 'driver');
  assert.equal(driver.time, '6 min');
  assert.equal(driver.distance, '2,4 km');
  assert.equal(passenger.message, driver.message);
  assert.equal(driver.vehicle, null);
  assert.match(passenger.vehicle, /Toyota.*TEST/);
});
test('expired, stale, foreign-request and wrong-session summaries are hidden', () => {
  assert.equal(show(undefined, 'stranger'), null);
  assert.equal(show(data, 'passenger'), null);
  assert.equal(show({ ...data, requestId: 'another' }), null);
  assert.equal(show(data, 'driver', now + 30000), null);
  assert.equal(show({ ...data, generatedAt: new Date(now - 30001).toISOString() }), null);
  assert.equal(show({ ...data, expiresAt: 'invalid' }), null);
  assert.equal(show({ ...data, viewerRole: 'admin' }), null);
});
test('unavailable or invalid routes do not fabricate an arrival estimate', () => {
  for (const estimate of [null, { distanceMeters: NaN, durationSeconds: 100 }, { distanceMeters: 100, durationSeconds: -1 }]) {
    assert.equal(show({ ...data, estimate }).time, null);
    assert.equal(show({ ...data, estimate }).message, 'Estimation indisponible');
  }
  assert.equal(show({ ...data, status: 'waiting_location' }).message, 'Position du conducteur en attente');
  assert.equal(show({ ...data, status: 'paused' }).message, 'Trajet en pause');
  assert.equal(show({ ...data, estimate: { distanceMeters: 0, durationSeconds: 0 } }).time, '1 min');
});
test('map links only accept actual valid coordinates', () => {
  assert.match(pickupMapUrl({ latitude: -4.3, longitude: 15.3 }), /query=-4.3,15.3$/);
  for (const point of [null, undefined, { latitude: NaN, longitude: 15 }, { latitude: 100, longitude: 15 }, { latitude: 0, longitude: 200 }]) {
    assert.equal(pickupMapUrl(point), null);
  }
});

test('summary card polls only while visible and online, hiding stale and failed reads', t => {
  const { hookHarness } = require('./helpers/hookHarness.cjs');
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now });
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const io = { online: true, userId: 'driver', active: true, reads: [], read: { currentData: { ...data, pickup: { location: 'Gare', reference: 'Entree', coordinates: null } }, fulfilledTimeStamp: now } };
  const { RequestPickupSummaryCard } = loader({ react: hooks.react,
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Button', Linking: { openURL() { throw Error('must require a tap'); } } },
    './requestSummaryStyles': { requestSummaryStyles: {} },
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { id: io.userId } }, zwangaApi: { config: { online: io.online } } }) },
    '@/store/api/requestPickupApi': { useGetRequestPickupSummaryQuery: (id, options) => { io.reads.push(options); return io.read; } },
  })('features/request-detail/RequestPickupSummaryCard.tsx');
  const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join(' ') : text(tree?.props?.children ?? '');
  const render = () => hooks.render(() => RequestPickupSummaryCard({ requestId: 'request', active: io.active }));
  assert.match(text(render()), /Passager/); assert.equal(io.reads.at(-1).pollingInterval, 30000);
  io.online = false; assert.doesNotMatch(text(render()), /Passager/); assert.equal(io.reads.at(-1).skip, true);
  io.online = true; io.read.isError = true; assert.doesNotMatch(text(render()), /Passager/);
  io.read.isError = false; io.userId = 'stranger'; assert.doesNotMatch(text(render()), /Passager/);
  io.userId = 'driver'; t.mock.timers.tick(30001); assert.doesNotMatch(text(render()), /Passager/);
  io.active = false; assert.equal(render(), null); assert.equal(io.reads.at(-1).pollingInterval, 0);
});

test('summary API encodes the id and does not retain unused private coordinates', () => {
  let endpoint;
  loader({ './baseApi': { baseApi: { injectEndpoints: config => {
    endpoint = config.endpoints({ query: value => value }).getRequestPickupSummary;
    return {};
  } } } })('store/api/requestPickupApi.ts');
  assert.deepEqual(endpoint.query('a/b'), { url: '/trip-requests/a%2Fb/pickup-summary', timeout: 10000 });
  assert.equal(endpoint.keepUnusedDataFor, 0);
  assert.deepEqual(endpoint.providesTags(null, null, 'request'), [{ type: 'TripRequest', id: 'request' }]);
});

test('contact pickup preview preserves address, reference, estimate and map without repeating identity', async t => {
  const { hookHarness } = require('./helpers/hookHarness.cjs');
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now });
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const urls = [];
  const read = { currentData: { ...data, pickup: {
    location: 'Avenue de test', reference: 'Entrée côté pharmacie', coordinates: { latitude: -4.3, longitude: 15.3 },
  } }, fulfilledTimeStamp: now };
  const { RequestPickupSummaryCard } = loader({ react: hooks.react,
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Button', Linking: { openURL: async url => { urls.push(url); } } },
    './requestSummaryStyles': { requestSummaryStyles: {} },
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { id: 'driver' } } }) },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: active => active, displayReadOptions: () => ({}) },
    '@/store/api/requestPickupApi': { useGetRequestPickupSummaryQuery: () => read },
  })('features/request-detail/RequestPickupSummaryCard.tsx');
  const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join(' ') : text(tree?.props?.children ?? '');
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
  const render = () => hooks.render(() => RequestPickupSummaryCard({ requestId: 'request', active: true, contactPreview: true }));
  const tree = render(), copy = text(tree);
  assert.match(copy, /DÉPART.*Carte.*Avenue de test.*Réf. :.*Entrée côté pharmacie.*Approche · 2,4 km · environ 6 min/);
  assert.doesNotMatch(copy, /Passager|VOTRE PASSAGER|hors arrêts|confirmation de départ/);
  assert.deepEqual(urls, []);
  const button = nodes(tree).find(node => node.type === 'Button');
  assert.match(button.props.accessibilityLabel, /Avenue de test.*Entrée côté pharmacie/);
  button.props.onPress(); await Promise.resolve();
  assert.deepEqual(urls, [pickupMapUrl(read.currentData.pickup.coordinates)]);
  read.currentData.status = 'waiting_location';
  assert.match(text(render()), /Position du conducteur en attente/);
  assert.doesNotMatch(text(render()), /environ 6 min/);
  read.currentData.pickup.coordinates = null;
  assert.equal(nodes(render()).some(node => node.type === 'Button'), false);
  read.isError = true; assert.doesNotMatch(text(render()), /Avenue de test/);
  assert.match(text(render()), /Prise en charge indisponible/);
  read.isError = false; t.mock.timers.tick(30001);
  assert.doesNotMatch(text(render()), /Avenue de test/);
});
