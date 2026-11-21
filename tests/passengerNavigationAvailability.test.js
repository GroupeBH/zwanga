const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { passengerNavigationAvailability: resolve } = loader()('features/passenger-navigation/passengerNavigationAvailability.ts');
const booking = { id: 'booking', tripId: 'trip', status: 'accepted' };
const trip = { id: 'trip', status: 'ongoing', departureTime: '2000-01-01T10:00:00Z' };
const base = { bookingId: 'booking', online: true, loading: false };

test('cold booking and dependent trip reads remain loading, never a missing reservation', () => {
  for (const data of [{}, { booking }]) assert.deepEqual(resolve({ ...base, ...data, loading: true }), { loading: true, feedback: null });
  assert.equal(resolve({ ...base, booking: { ...booking, tripId: '' }, loading: true }).feedback.retry, true);
  assert.equal(resolve({ ...base, bookingId: '', loading: true }).feedback.title, 'Lien incomplet');
});

test('old departure dates never expire ongoing or paused rides; completed rides retain payment access', () => {
  for (const current of [trip, { ...trip, isExpired: true },
    { ...trip, status: 'upcoming', startedAt: trip.departureTime },
    { ...trip, status: 'completed', startedAt: trip.departureTime }]) {
    assert.equal(resolve({ ...base, booking, trip: current }).feedback, null);
  }
  assert.equal(resolve({ ...base, booking: { ...booking, status: 'completed' }, trip }).feedback, null);
  assert.equal(resolve({ ...base, booking: { ...booking, status: 'completed' } }).feedback.title, 'Trajet terminé');
});

test('expiry and cancellation use confirmed facts rather than a generic missing reservation', () => {
  for (const current of [{ ...trip, status: 'upcoming' }, { ...trip, status: 'completed', isExpired: true }]) {
    assert.equal(resolve({ ...base, booking, trip: current }).feedback.title, 'Trajet expiré');
  }
  assert.equal(resolve({ ...base, booking, trip: { ...trip, status: 'cancelled' } }).feedback.title, 'Trajet annulé');
  for (const [status, title] of [['cancelled', 'Réservation annulée'], ['rejected', 'Réservation refusée']]) {
    assert.equal(resolve({ ...base, trip, booking: { ...booking, status } }).feedback.title, title);
  }
  // no_show remains eligible for the existing boarding-recovery flow.
  assert.equal(resolve({ ...base, trip, booking: { ...booking, status: 'no_show' } }).feedback, null);
});

test('both API errors distinguish account access, expiry and inaccessible links without reviving cached trips', () => {
  for (const field of ['bookingError', 'tripError']) {
    for (const [status, title] of [[401, 'Connexion nécessaire'], [403, 'Trajet non accessible'], [404, 'Trajet indisponible'], [410, 'Trajet indisponible']]) {
      const view = resolve({ ...base, booking, trip, [field]: { status } });
      assert.equal(view.feedback.title, title); assert.equal(view.feedback.retry, false);
    }
    assert.equal(resolve({ ...base, [field]: { status: 404, data: { code: 'TRIP_EXPIRED' } } }).feedback.title, 'Trajet expiré');
  }
});

test('offline and temporary failures offer recovery, not a false deletion; existing offline route remains usable', () => {
  for (const status of ['FETCH_ERROR', 'TIMEOUT_ERROR', 500, 503, 'PARSING_ERROR']) {
    for (const field of ['bookingError', 'tripError']) {
      const view = resolve({ ...base, [field]: { status } });
      assert.equal(view.feedback.retry, true); assert.doesNotMatch(view.feedback.message, /supprim|expir|annul/);
      assert.equal(resolve({ ...base, booking, trip, [field]: { status }, online: false }).feedback, null);
    }
  }
  assert.equal(resolve({ ...base, online: false, loading: true }).loading, false);
  assert.equal(resolve({ ...base, online: false }).feedback.icon, 'cloud-offline-outline');
});

const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
const words = n => typeof n === 'string' ? n : Array.isArray(n) ? n.map(words).join('') : n?.props ? words(n.props.children) : '';
const native = { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button', StyleSheet: { create: s => s } };
const { PassengerNavigationUnavailable: Screen } = loader({ 'react-native': native,
  'react-native-safe-area-context': { SafeAreaView: 'SafeArea' }, '@expo/vector-icons': { Ionicons: 'Icon' },
})('features/passenger-navigation/PassengerNavigationUnavailable.tsx');

test('unavailable UI has a calm status, scrollable content and explicit recovery/home actions', () => {
  const calls = [], props = { feedback: resolve({ ...base, tripError: { status: 503 } }).feedback, busy: false, online: true, active: true,
    onRetry: () => calls.push('retry'), onHome: () => calls.push('home'), onBookings: () => calls.push('bookings') };
  const tree = Screen(props);
  assert.ok(nodes(tree).some(n => n.type === 'Scroll'));
  assert.equal(nodes(tree).find(n => n.type === 'Icon').props.name, 'information-circle-outline');
  assert.doesNotMatch(words(tree), /Réservation introuvable/);
  nodes(tree).filter(n => n.type === 'Button').forEach(n => n.props.onPress());
  assert.deepEqual(calls, ['retry', 'home']);
  for (const next of [{ busy: true }, { online: false }, { active: false }]) {
    const button = nodes(Screen({ ...props, ...next })).find(n => n.type === 'Button');
    assert.equal(button.props.disabled, true); button.props.onPress();
  }
  assert.deepEqual(calls, ['retry', 'home']);
  const terminal = Screen({ ...props, feedback: resolve({ ...base, bookingError: { status: 404 } }).feedback });
  assert.match(words(terminal), /Mes réservations/); assert.doesNotMatch(words(terminal), /Réessayer/);
  nodes(terminal).find(n => n.type === 'Button').props.onPress(); assert.equal(calls.at(-1), 'bookings');
});
