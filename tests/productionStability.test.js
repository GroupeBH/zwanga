const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { EventEmitter } = require('node:events');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function encode(points) {
  let lat = 0, lng = 0;
  const delta = n => {
    let v = n < 0 ? -2 * n - 1 : 2 * n, result = '';
    while (v >= 32) { result += String.fromCharCode(63 + 32 + (v % 32)); v = Math.floor(v / 32); }
    return result + String.fromCharCode(63 + v);
  };
  return points.map(point => {
    const a = Math.round(point.latitude * 1e5), b = Math.round(point.longitude * 1e5);
    const result = delta(a - lat) + delta(b - lng); lat = a; lng = b; return result;
  }).join('');
}

test('route decoder rejects malformed/oversized inputs and retains endpoints within its budget', () => {
  const { decodeSafePolyline, MAX_PREVIEW_ROUTE_POINTS } = loader()('utils/routes/safePolyline.ts');
  const points = Array.from({ length: 8000 }, (_, i) => ({ latitude: -4.3, longitude: 15.2 + i / 1e5 }));
  const route = decodeSafePolyline(encode(points));
  assert.equal(route.length, MAX_PREVIEW_ROUTE_POINTS);
  assert.deepEqual(route[0], points[0]);
  assert.ok(Math.abs(route.at(-1).longitude - points.at(-1).longitude) < 1e-9);
  for (const input of [null, {}, '', '?', '~~~~~~', '\u0000?', '??'.repeat(150000),
    encode([{ latitude: 100, longitude: 15 }, { latitude: 101, longitude: 15 }])]) {
    assert.deepEqual(decodeSafePolyline(input), []);
  }
});

test('both form previews reject invalid routes and cannot overflow with 150,000 points', () => {
  const load = loader({ 'react-native': { Platform: { OS: 'ios' } },
    'react-native-maps': { PROVIDER_GOOGLE: 'google' }, '@react-native-community/datetimepicker': {} });
  const origin = { latitude: -4.3, longitude: 15.3 }, destination = { latitude: -4.2, longitude: 15.2 };
  for (const filename of ['features/publish/publishModel.ts', 'features/trip-request/requestFormModel.ts']) {
    const model = load(filename);
    const large = Array(150000).fill(origin);
    assert.deepEqual(model.getRenderableRouteCoordinates(large, origin, destination), []);
    assert.doesNotThrow(() => model.buildRoutePreviewRegion(large));
    assert.deepEqual(model.getRenderableRouteCoordinates([null, destination], origin, destination), []);
    assert.deepEqual(model.getRenderableRouteCoordinates([origin, destination], origin, destination), []);
    assert.equal(model.buildRoutePreviewRegion([origin]).latitude, origin.latitude);
  }
});

test('actual route request falls back safely and resets mutations for malformed responses', async () => {
  let resets = 0, encoded = '??'.repeat(150000);
  const load = loader({
    '@/store': { store: { dispatch: () => Object.assign(Promise.resolve({ data: {
      routes: [{ overviewPolyline: encoded, legs: [{ duration: 120, distance: 1000 }] }],
    } }), { abort() {}, reset() { resets++; } }) } },
    '@/store/api/googleMapsApi': { TravelMode: { DRIVING: 'driving' }, googleMapsApi: {
      endpoints: { getDirections: { initiate: value => value } },
    } },
    '@/utils/routeHelpers': { calculateDistance: () => 1 },
  });
  const api = load('utils/routeApi.ts');
  const origin = { latitude: -4.3, longitude: 15.3 }, destination = { latitude: -4.2, longitude: 15.2 };
  assert.deepEqual((await api.getRouteInfo(origin, destination)).coordinates, [origin, destination]);
  encoded = encode([origin, { latitude: -4.25, longitude: 15.25 }, destination]);
  const valid = await api.getRouteInfo({ ...origin, latitude: -4.31 }, destination);
  assert.equal(valid.coordinates.length, 3);
  assert.equal(valid.duration, 120);
  assert.equal(valid.distance, 1000);
  assert.equal(resets, 2);
});

class Socket extends EventEmitter {
  connected = false;
  connect() { this.connected = true; this.emit('connect'); return this; }
  disconnect() { this.connected = false; return this; }
}
function socketFixture() {
  const socket = new Socket(), warnings = [];
  const load = loader({ '@/config/env': { API_BASE_URL: 'https://audit.invalid/v1' },
    '@/services/tokenRefresh': { getValidAccessToken: async () => 'synthetic', handle401Error: async () => false },
    'socket.io-client': { io: () => socket },
    '@/utils/throttledWarning': { warnThrottled: (...args) => warnings.push(args) },
  });
  return { socket, load, warnings };
}

test('socket batches tolerate malformed/mixed entries, bound volume and isolate listeners', async () => {
  const { socket, load, warnings } = socketFixture();
  const client = load('services/trackingSocket.ts').trackingSocket;
  const received = [];
  client.subscribeToPassengerLocation(() => { throw new Error('synthetic'); });
  client.subscribeToPassengerLocation(value => received.push(value));
  await client.joinTrip('trip');
  const valid = { tripId: 'trip', bookingId: 'booking', coordinates: [15.3, -4.3], updatedAt: new Date().toISOString() };
  for (const invalid of [null, {}, { locations: {} }, { locations: 'bad' }]) {
    assert.doesNotThrow(() => socket.emit('passenger_locations', invalid));
  }
  socket.emit('passenger_locations', { locations: [null, valid, { ...valid, coordinates: [Infinity, 0] }] });
  assert.deepEqual(received, [valid]);
  socket.emit('passenger_locations', Array(2000).fill(valid));
  assert.equal(received.length, 257);
  socket.emit('passenger_location', { ...valid, coordinates: [181, 0] });
  socket.emit('passenger_location', { ...valid, coordinates: null });
  assert.equal(received.length, 258);
  assert.ok(warnings.every(args => args.length === 1));
  client.disconnect();
});

test('a faulty chat subscriber cannot prevent delivery to another subscriber', async () => {
  const { socket, load } = socketFixture();
  const client = load('services/chatSocket.ts').chatSocket, received = [];
  client.subscribeToMessages(() => { throw new Error('private content'); });
  client.subscribeToMessages(message => received.push(message));
  await client.joinBookingRoom('booking');
  const message = { id: 'message', conversationId: 'conversation', senderId: 'sender',
    content: 'synthetic', isRead: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  assert.doesNotThrow(() => socket.emit('new_message', message));
  socket.emit('new_message', { ...message, createdAt: {} });
  socket.emit('new_message', null);
  assert.deepEqual(received, [message]);
  client.disconnect();
});

test('booking panel switches without delayed reopening and ignores actions after blur/unmount', () => {
  const h = hookHarness(), updates = [], navigation = [];
  let focused = true;
  const hook = loader({ react: h.react, '@react-navigation/native': { useIsFocused: () => focused },
    '@/hooks/useAppIsActive': { useAppIsActive: () => true }, 'react-native': { Keyboard: { dismiss() {} } },
  })('hooks/trip-detail/useTripBookingWizard.ts').useTripBookingWizard;
  const args = new Proxy({ isBooking: false, router: { push: value => navigation.push(value) } }, {
    get: (value, key) => key in value ? value[key] : next => updates.push([key, next]),
  });
  const render = () => h.render(() => hook(args));
  const wizard = render();
  wizard.openBookingLocationPicker('origin');
  assert.deepEqual(updates.slice(0, 3), [['setBookingModalVisible', false], ['setShowOriginPicker', true], ['setShowDestinationPicker', false]]);
  wizard.restoreBookingModalAfterLocationPicker();
  assert.deepEqual(updates.at(-1), ['setBookingModalVisible', true]);
  focused = false; render(); updates.length = 0;
  wizard.openBookingLocationPicker('destination'); wizard.handleViewBookings();
  assert.deepEqual(updates, []); assert.deepEqual(navigation, []);
  focused = true; const current = render(); current.handleViewBookings(); render().handleViewBookings();
  assert.deepEqual(navigation, ['/bookings']);
  h.unmount(); updates.length = 0;
  current.openBookingLocationPicker('origin'); assert.deepEqual(updates, []);
});

test('trip detail native modals share the route overlay and booking panels support Android back', () => {
  const source = fs.readFileSync('app/trip/[id].tsx', 'utf8');
  assert.match(source, /<RideOverlayScope[^>]+active=\{model.data.isScreenActive\}/);
  for (const name of ['TripBookingSuccessModal', 'TripImageModal', 'TripMapModal', 'TripReviewsModal', 'TripVehicleDetailsModal']) {
    assert.match(fs.readFileSync(`features/trip-detail/${name}.tsx`, 'utf8'), /RideModal as Modal/);
  }
  assert.match(fs.readFileSync('features/trip-detail/TripBookingSuccessModal.tsx', 'utf8'), /onRequestClose=\{closeBookingSuccessModal\}/);
  assert.match(fs.readFileSync('features/trip-detail/TripBookingModal.tsx', 'utf8'), /onRequestClose=\{closeBookingModal\}/);
  assert.doesNotMatch(fs.readFileSync('hooks/trip-detail/useTripBookingWizard.ts', 'utf8'), /setTimeout/);
});
