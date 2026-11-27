const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { skipToken } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const trip = Object.freeze({ id: 'trip', departure: Object.freeze({ name: 'Départ conducteur', address: 'Avenue du Départ', lat: -4.33, lng: 15.32 }),
  arrival: Object.freeze({ name: 'Marché de démonstration', address: 'Marché de démonstration', lat: -4.35, lng: 15.3, hasCoordinates: true }) });
const gps = Object.freeze({ coords: Object.freeze({ latitude: -4.31, longitude: 15.28 }), timestamp: 1000 });
const response = Object.freeze({ formattedAddress: '12 Avenue de Démonstration, Kinshasa', lat: -4.3101, lng: 15.2801 });

function fixture(t) {
  const hooks = hookHarness(), reads = [], writes = [];
  let active = true, state = { isFetching: true };
  const load = loader({ react: { ...React, ...hooks.react },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/store/api/googleMapsApi': { useGetRouteLocationAddressQuery: (args, options) => {
      reads.push({ args, options }); return args === skipToken ? {} : state;
    } },
  });
  const { useTripBookingLocationForm } = load('hooks/trip-detail/useTripBookingLocationForm.ts');
  const params = { bookingModalVisible: false, lastKnownLocation: gps, trip, passengerOrigin: null, passengerDestination: null,
    passengerOriginManualAddress: '', passengerDestinationManualAddress: '', isIdentityVerified: true,
    checkIdentity: () => writes.push('kyc'), requestDriverLocationPermission: async () => writes.push('permission') };
  for (const key of ['bookingSeats', 'bookingPaymentMode', 'bookingModalError', 'passengerOrigin', 'passengerOriginManualAddress',
    'passengerDestination', 'passengerDestinationManualAddress', 'shouldAutofillPassengerOrigin', 'bookingStep', 'bookingModalVisible']) {
    params[`set${key[0].toUpperCase()}${key.slice(1)}`] = value => { params[key] = value; writes.push(key); };
  }
  t.after(hooks.unmount);
  return { params, reads, writes, load, hooks, setState: value => { state = value; }, setActive: value => { active = value; },
    render: () => { reads.length = 0; return hooks.render(() => useTripBookingLocationForm(params)); } };
}

test('automatic GPS pickup is resolved to its street instead of Adresse non disponible, without changing coordinates', t => {
  const f = fixture(t);
  const before = JSON.stringify({ trip, gps });
  f.render().openBookingModal();
  const selected = f.params.passengerOrigin;
  let result = f.render();
  assert.equal(result.passengerOriginDisplay, 'Recherche de l’adresse…');
  assert.deepEqual(f.reads[0].args, { lat: gps.coords.latitude, lng: gps.coords.longitude, language: 'fr', region: 'cd' });
  assert.equal(f.reads[1].args, skipToken, 'the readable destination needs no request');
  const writeCount = f.writes.length;
  f.setState({ currentData: response, isFetching: false }); result = f.render();
  assert.equal(result.bookingLocationLabels.origin.text, response.formattedAddress);
  assert.equal(result.passengerDestinationDisplay, trip.arrival.address);
  assert.equal(f.writes.length, writeCount, 'display-only enrichment cannot overwrite selection or API data');
  assert.strictEqual(f.params.passengerOrigin, selected);
  assert.equal(JSON.stringify({ trip, gps }), before);
  assert.equal(f.reads[0].options.pollingInterval, 0);
  assert.equal(f.reads[0].options.refetchOnFocus, false);
});

test('a usable selection address survives a generic title, with no geocoding request', t => {
  const f = fixture(t);
  f.params.bookingModalVisible = true;
  f.params.passengerOrigin = { title: 'Ma position actuelle', address: 'Avenue de Démonstration', latitude: -4.31, longitude: 15.28 };
  assert.equal(f.render().passengerOriginDisplay, 'Avenue de Démonstration');
  assert.equal(f.reads[0].args, skipToken);
});

test('new GPS updates do not move the chosen pickup or relaunch address lookups', t => {
  const f = fixture(t); f.render().openBookingModal();
  f.setState({ currentData: response }); const first = f.render(); const args = f.reads[0].args;
  f.params.lastKnownLocation = { coords: { latitude: -4.36, longitude: 15.34 }, timestamp: 2000 };
  assert.equal(f.render().passengerOriginDisplay, first.passengerOriginDisplay);
  assert.strictEqual(f.reads[0].args, args);
  assert.equal(f.params.passengerOrigin.latitude, gps.coords.latitude);
});

test('late results for the previous point cannot name the new point or override manual input', t => {
  const f = fixture(t); f.render().openBookingModal();
  f.setState({ currentData: response }); f.render();
  f.params.passengerOrigin = { title: 'Point sélectionné', address: '-4.36, 15.34', latitude: -4.36, longitude: 15.34 };
  f.setState({ data: response, currentData: undefined, isFetching: true });
  assert.equal(f.render().passengerOriginDisplay, 'Recherche de l’adresse…');
  assert.equal(f.reads[0].args.lat, -4.36);
  f.params.passengerOriginManualAddress = 'Gare de démonstration';
  assert.equal(f.render().passengerOriginDisplay, 'Gare de démonstration');
  assert.equal(f.reads[0].args, skipToken, 'manual text must not be geocoded at the old selected coordinates');
});

test('failed lookup keeps the selected point actionable and never borrows the driver departure', t => {
  const f = fixture(t); f.render().openBookingModal();
  for (const state of [{ isError: true }, { currentData: { formattedAddress: 'H8XW+6XG' } }, {}]) {
    f.setState(state);
    const result = f.render();
    assert.equal(result.passengerOriginDisplay, 'Position choisie sur la carte');
    assert.match(result.bookingLocationLabels.origin.hint, /Touchez/);
    assert.notEqual(result.passengerOriginDisplay, trip.departure.address);
    assert.equal(f.params.passengerOrigin.latitude, gps.coords.latitude);
  }
});

test('address lookup is paused when the booking closes or the application is not active', t => {
  const f = fixture(t); f.render().openBookingModal(); f.render();
  assert.equal(f.reads[0].options.skip, false);
  f.params.bookingModalVisible = false; f.render(); assert.equal(f.reads[0].options.skip, true);
  f.params.bookingModalVisible = true; f.setActive(false); f.render(); assert.equal(f.reads[0].options.skip, true);
});

test('missing and invalid coordinates require a point without claiming a map selection', t => {
  const f = fixture(t); f.params.trip = { id: 'trip', departure: { hasCoordinates: false, lat: -4.33, lng: 15.32 },
    arrival: { hasCoordinates: false, lat: -4.35, lng: 15.3 } };
  for (const coords of [undefined, { latitude: null, longitude: 15 }, { latitude: NaN, longitude: 15 },
    { latitude: 91, longitude: 15 }, { latitude: 0, longitude: 0 }]) {
    f.params.lastKnownLocation = coords ? { coords } : null;
    assert.equal(f.render().defaultPassengerOriginSelection, null);
    f.render().openBookingModal();
    assert.equal(f.params.passengerDestination, null, 'mapper fallback coordinates are not a valid destination');
    const result = f.render();
    assert.equal(result.passengerOriginDisplay, 'Choisir un lieu');
    assert.equal(result.passengerDestinationDisplay, 'Choisir un lieu');
    assert.ok(f.reads.every(read => read.args === skipToken));
  }
});

test('a coordinate-only trip destination uses its own point, not the passenger pickup', t => {
  const f = fixture(t); f.params.trip = { ...trip, arrival: { lat: -4.35, lng: 15.3, hasCoordinates: true } };
  f.render().openBookingModal();
  assert.equal(f.render().passengerDestinationDisplay, 'Recherche de l’adresse…');
  assert.deepEqual(f.reads[1].args, { lat: -4.35, lng: 15.3, language: 'fr', region: 'cd' });
});

test('the booking component preserves resolving state and point actions instead of sanitizing them away', () => {
  const native = { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ScrollView: 'Scroll', StyleSheet: { create: v => v } };
  const load = loader({ react: React, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/components/PassengerSeatNotice': { PassengerSeatNotice: 'SeatNotice' },
    '@/components/forms/FormDisclosure': { FormDisclosure: 'Disclosure' },
    './BookingPriceProposalField': { BookingPriceProposalField: 'PriceProposal' } });
  const { TripBookingSteps: Form } = load('features/trip-detail/TripBookingSteps.tsx');
  const calls = [], labels = { origin: { text: 'Recherche de l’adresse…' },
    destination: { text: 'Position choisie sur la carte', hint: 'Touchez pour voir ou préciser le lieu.' } };
  const props = { trip, viewportHeight: 800, bookingSeats: '1', seatLimit: 2, bookingLocationLabels: labels,
    passengerOriginDisplay: 'Ma position actuelle', passengerDestinationDisplay: 'Destination',
    openBookingLocationPicker: target => calls.push(target) };
  const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
  const tree = nodes(Form(props)); const text = tree.filter(n => n.type === 'Text').map(n => n.props.children);
  assert.ok(text.includes(labels.origin.text)); assert.ok(text.includes(labels.destination.text));
  assert.ok(text.includes(labels.destination.hint)); assert.ok(!text.includes('Adresse non disponible'));
  assert.ok(text.some(value => typeof value === 'string' && value.includes('100 m maximum')));
  tree.filter(n => n.props?.accessibilityLabel?.startsWith('Modifier le point')).forEach(n => n.props.onPress());
  assert.deepEqual(calls, ['origin', 'destination']);
});
