const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');

const assets = {
  getTripMarkerImage: (trip, selected) => `trip-${trip.vehicleType}${selected ? '-selected' : ''}`,
  getTripRequestMarkerImage: gender => `request-${gender ?? 'neutral'}`,
};
const load = loader({ './homeMapAssets': assets,
  'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: value => value } },
  '@expo/vector-icons': { Ionicons: 'Icon' },
  './HomeDriverStatus': { HomeDriverStatus: 'HomeDriverStatus' } });
const { buildHomeMapMarkers, homeMapMarkerSummary, HOME_MAP_MARKER_LIMIT } = load('features/home/homeMapMarkers.ts');
const { homeDriverStatusView, RECENT_DRIVER_POSITION_MS } = load('features/home/homeDriverStatus.ts');
const { homePriorityKeys } = load('features/home/homePriorityDismissal.ts');
const { HomeHeader } = load('components/home/HomeHeader.tsx');

const point = (lat, lng, name) => ({ lat, lng, name });
const trip = (id, vehicleType, lat = -4.33) => ({ id, vehicleType,
  departure: point(lat, 15.31, 'Gombe'), arrival: point(-4.4, 15.25, 'Ngaliema') });
const request = (id, passengerGender) => ({ id, passengerGender, departureDateMax: '2026-12-02',
  departure: point(-4.33, 15.31, 'Limete'), arrival: point(-4.4, 15.25, 'Kintambo') });

function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
}
const text = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(text).join('')
  : React.isValidElement(node) ? text(node.props.children) : '';

test('passengers see published departures with the existing vehicle-type icons, never clients', () => {
  const markers = buildHomeMapMarkers({ isDriver: false, latestTrips: [trip('a', 'car'), trip('b', 'moto'), trip('c', 'tricycle')],
    availableDriverRequests: [request('r', 'female')] });
  assert.deepEqual(markers.map(m => [m.key, m.kind, m.image]),
    [['trip:a', 'trip', 'trip-car'], ['trip:b', 'trip', 'trip-moto'], ['trip:c', 'trip', 'trip-tricycle']]);
  assert.equal(markers[0].title, 'Gombe → Ngaliema');
  assert.equal(homeMapMarkerSummary(false, markers.length), '3 départs près de vous');
});

test('drivers see nearby clients with the existing gender icons and dismissed clients stay hidden', () => {
  const hidden = request('hidden', 'male');
  const markers = buildHomeMapMarkers({ isDriver: true, latestTrips: [trip('t', 'car')],
    availableDriverRequests: [request('f', 'female'), request('m', 'male'), request('n'), hidden],
    hiddenHomePriorities: { [homePriorityKeys.nearbyRequest(hidden)]: true } });
  assert.deepEqual(markers.map(m => [m.id, m.kind, m.image]),
    [['f', 'request', 'request-female'], ['m', 'request', 'request-male'], ['n', 'request', 'request-neutral']]);
  assert.equal(homeMapMarkerSummary(true, 1), '1 client près de vous');
  assert.equal(homeMapMarkerSummary(true, 0), null);
});

test('invalid or unconfirmed coordinates are skipped and the native marker count stays bounded', () => {
  const broken = [{ ...trip('nan', 'car'), departure: point(Number.NaN, 15.3) },
    { ...trip('unconfirmed', 'car'), departure: { ...point(-4.3, 15.3), hasCoordinates: false } }, null];
  const many = Array.from({ length: 25 }, (_, i) => trip(`t${i}`, 'car'));
  assert.deepEqual(buildHomeMapMarkers({ isDriver: false, latestTrips: broken, availableDriverRequests: [] }), []);
  assert.equal(buildHomeMapMarkers({ isDriver: false, latestTrips: many, availableDriverRequests: [] }).length, HOME_MAP_MARKER_LIMIT);
});

test('driver status describes server availability without promising push delivery', () => {
  const now = Date.parse('2026-10-29T12:00:00Z');
  const status = (available, minutesAgo) => ({ enabled: true, available, pendingOfferId: null,
    presence: minutesAgo == null ? null : { vehicleId: 'v', leaseId: 'l', seats: 2, expiresAt: '', discoveryEnabled: true,
      updatedAt: new Date(now - minutesAgo * 60_000).toISOString() } });
  assert.equal(homeDriverStatusView({ online: true, now }), null, 'no data yet: nothing rather than a guess');
  assert.equal(homeDriverStatusView({ online: true, data: { ...status(true, 1), enabled: false }, now }), null);
  assert.equal(homeDriverStatusView({ online: false, now }).title, 'Hors ligne');
  assert.equal(homeDriverStatusView({ online: true, isError: true, now }).title, 'Statut à vérifier');
  assert.deepEqual(homeDriverStatusView({ online: true, data: status(false, 1), now }),
    { tone: 'off', title: 'Disponibilité à vérifier', detail: 'Touchez pour voir pourquoi' });
  assert.deepEqual(homeDriverStatusView({ online: true, data: status(true, 2), now }),
    { tone: 'ok', title: 'Demandes possibles', detail: 'Position à jour il y a 2 min' });
  const stale = homeDriverStatusView({ online: true, data: status(true, RECENT_DRIVER_POSITION_MS / 60_000 + 60), now });
  assert.equal(stale.tone, 'warn'); assert.equal(stale.detail, 'Dernière position il y a 1 h');
  assert.equal(homeDriverStatusView({ online: true, data: status(true, 1), isError: true, now }).title, 'Statut à vérifier');
  const legacy = status(true, 1); legacy.presence.discoveryEnabled = null;
  legacy.presence.expiresAt = new Date(now - 1).toISOString();
  assert.equal(homeDriverStatusView({ online: true, data: legacy, now }).title, 'Position à actualiser');
  legacy.presence.expiresAt = new Date(now + 60_000).toISOString();
  assert.equal(homeDriverStatusView({ online: true, data: legacy, now }).tone, 'ok');
  legacy.presence.discoveryEnabled = false;
  assert.equal(homeDriverStatusView({ online: true, data: legacy, now }).title, 'Demandes désactivées');
  assert.equal(homeDriverStatusView({ online: true, data: status(true, null), now }).tone, 'warn');
});

test('driver header shows the alert status; the ongoing-trip pill opens the same guidance as the banner', () => {
  const calls = [];
  const base = { insets: { top: 20 }, profileInitial: 'A', unreadNotifications: 0, router: { push: path => calls.push(path) } };
  const driverTree = HomeHeader.type({ ...base, isDriver: true, isScreenActive: true });
  const status = nodes(driverTree).find(node => node.type === 'HomeDriverStatus');
  assert.equal(status.props.active, true); status.props.onPress();
  assert.equal(nodes(HomeHeader.type(base)).some(node => node.type === 'HomeDriverStatus'), false);
  const driving = HomeHeader.type({ ...base, isDriver: true, ongoingDriverTrip: { id: 'trip-1' } });
  assert.equal(nodes(driving).some(node => node.type === 'HomeDriverStatus'), false, 'one status at a time');
  nodes(driving).find(node => node.props.accessibilityLabel === 'Trajet en cours').props.onPress();
  const riding = HomeHeader.type({ ...base, ongoingBookedTrip: { id: 'trip-2' }, ongoingBookingId: 'booking-2' });
  nodes(riding).find(node => node.props.accessibilityLabel === 'Trajet en cours').props.onPress();
  assert.deepEqual(calls, ['/driver-availability', '/trip/navigate/trip-1', '/booking/navigate/booking-2']);
  const unknown = HomeHeader.type({ ...base, ongoingBookedTrip: { id: 'trip-3' } });
  assert.match(text(unknown), /Trajet en cours/);
  assert.equal(nodes(unknown).some(node => node.type === 'Button' && /Trajet en cours/.test(text(node))), false,
    'without a booking id the pill stays informative instead of opening a wrong route');
});
