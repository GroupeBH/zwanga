const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(words).join('') : node?.props ? words(node.props.children) : '';
const native = { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
  StyleSheet: { create: x => x }, useWindowDimensions: () => ({ width: 320, height: 568 }) };
const flatStyle = value => Object.assign({}, ...(Array.isArray(value) ? value : [value]).filter(Boolean));
const booking = { id: 'booking', numberOfSeats: 2, paymentAmount: 10000, status: 'accepted', pickedUp: true, pickedUpConfirmedByPassenger: true };
const quote = { bookingId: 'booking', currency: 'CDF', isEstimate: true, passengerAmount: 2000, originalPassengerAmount: 10000,
  minimumAmount: 1500, prepaidAmount: 0, minimumApplied: false, plannedDistanceMeters: 25000, travelledDistanceMeters: 5000, travelledPercentage: 20 };
const model = loader()('features/passenger-navigation/interruptionFarePreview.ts');

test('minimum applies once to the reservation, is capped by the passenger price and preserves free rides', () => {
  for (const [price, minimum] of [[10000, 1500], ['2000', 1500], [1000, 1000], [0, 0]]) {
    assert.equal(model.getInterruptionFareBase({ paymentAmount: price }).minimumAmount, minimum);
  }
  for (const price of [null, undefined, '', '  ', -1, NaN, Infinity]) {
    assert.equal(model.getInterruptionFareBase({ paymentAmount: price }).minimumAmount, null);
  }
});

test('preview rejects wrong-booking, malformed and out-of-range quotes', () => {
  assert.equal(model.isValidPassengerFarePreview(quote, 'booking'), true);
  for (const overrides of [{ bookingId: 'other' }, { passengerAmount: 10001 }, { passengerAmount: 1000 },
    { travelledPercentage: 101 }, { minimumAmount: 0 }, { prepaidAmount: 12000 }, { currency: 'USD' },
    { passengerAmount: NaN }, { travelledDistanceMeters: 26000 }, { isEstimate: false }]) {
    assert.equal(model.isValidPassengerFarePreview({ ...quote, ...overrides }, 'booking'), false);
  }
});

function previewEnvironment(state) {
  const queries = []; let retries = 0;
  const { PassengerInterruptionFarePreview } = loader({ 'react-native': native,
    '@/store/api/bookingApi': { useGetPassengerInterruptionFarePreviewQuery: (arg, options) => {
      queries.push({ arg, options }); return { ...state, refetch: () => { retries++; } };
    } },
  })('features/passenger-navigation/PassengerInterruptionFarePreview.tsx');
  return { render: (b = booking) => PassengerInterruptionFarePreview({ booking: b, coordinates: { latitude: -4.3, longitude: 15.3 } }),
    queries, retries: () => retries };
}

test('shows base immediately during calculation without polling or refetching on GPS/foreground events', () => {
  const env = previewEnvironment({ isFetching: true });
  const tree = env.render(); const text = words(tree).replace(/\s/g, '');
  assert.match(text, /Minimum.*1500FC.*initial:10000FC.*2places/);
  assert.match(words(tree), /les 2 personnes de votre réservation, pas pour les autres passagers/);
  assert.ok(all(tree).some(node => node.type === 'Spinner'));
  assert.ok(tree.props.style.maxHeight < 200, 'content scrolls while dialog actions remain outside');
  assert.equal(env.queries[0].options.refetchOnFocus, false);
  assert.equal(env.queries[0].options.refetchOnReconnect, false);
  assert.equal(env.queries[0].options.pollingInterval, undefined);
});

test('displays the server estimate and prepaid credit without requesting a second payment', () => {
  const env = previewEnvironment({ currentData: { ...quote, prepaidAmount: 10000 } });
  const text = words(env.render()).replace(/\s/g, '');
  assert.match(text, /2000FC.*5kmsur25km.*20%/);
  assert.match(text, /Déjàpayé:10000FC.*sanssecondpaiement/);
});

test('network failure leaves the minimum and urgent request instructions visible, with explicit retry', () => {
  const env = previewEnvironment({ isError: true, currentData: quote });
  const tree = env.render();
  assert.match(words(tree), /Estimation indisponible.*quand même demander à descendre/);
  assert.doesNotMatch(words(tree), /5 km sur/);
  all(tree).find(node => node.type === 'Button').props.onPress();
  assert.equal(env.retries(), 1);
});

test('free bookings skip the distance request and keep their price at zero', () => {
  const env = previewEnvironment({}); const tree = env.render({ ...booking, paymentAmount: 0 });
  assert.match(words(tree), /Gratuit.*trajet reste gratuit/);
  assert.equal(env.queries[0].options.skip, true);
  assert.doesNotMatch(words(tree), /Estimation indisponible/);
});

test('preview is a read-only RTK query with no long-lived coordinate cache', () => {
  const { buildConfirmDropoffByPassengerEndpoints } = loader({
    './bookingMapper': { mapServerBookingToClient: x => x },
  })('store/api/booking/confirmDropoffByPassenger.endpoints.ts');
  const endpoints = buildConfirmDropoffByPassengerEndpoints({ query: x => x, mutation: x => x });
  const endpoint = endpoints.getPassengerInterruptionFarePreview;
  assert.deepEqual(endpoint.query({ bookingId: 'b', coordinates: null }), {
    url: '/bookings/b/interruption-request/preview', method: 'POST', body: { coordinates: null },
  });
  assert.equal(endpoint.keepUnusedDataFor, 0);
  assert.equal(endpoint.invalidatesTags, undefined);
});

test('urgent driver prompt stays outside the clipped route scroll and keeps assistance available', () => {
  const { DriverNavigationTopPanel } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/navigation/NavigationAssistanceButtons': { NavigationAssistanceButtons: 'Assistance' },
    '@/features/ride-recovery/RideRecoveryControl': { RideRecoveryControl: 'Recovery' },
    './DriverNavigationPassengersBar': { DriverNavigationPassengersBar: 'Passengers' },
    './DriverDropoffReceipts': { DriverDropoffReceipts: 'DropoffReceipts' },
  })('features/driver-navigation/DriverNavigationTopPanel.tsx');
  const foundation = { data: { isTripOngoing: true, insets: { top: 20, left: 0, right: 0 } },
    mapState: { waypoints: [], isSocketConnected: true }, passengers: { activePassengerInterruptionBooking: booking } };
  const tree = DriverNavigationTopPanel({ model: { session: { foundation }, presentation: {}, bookingActions: {}, passengerPresentation: {} }, assistance: {} });
  assert.equal(all(tree).filter(node => node.type === 'Scroll').length, 0);
  assert.equal(all(tree).filter(node => node.type === 'Passengers').length, 1);
  assert.equal(all(tree).filter(node => node.type === 'Recovery').length, 0);
  assert.ok(all(tree).some(node => node.type === 'Assistance'));
});

test('compact driver prompt preserves both actions, minimum touch targets and mutation guards', () => {
  const { DriverInterruptionPrompt } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } })('features/driver-navigation/DriverInterruptionPrompt.tsx');
  const calls = []; const props = { booking: { ...booking, passengerName: 'Passager', interruptionRequest: { reason: 'emergency' } }, queuedCount: 1,
    busy: false, confirming: false, rejecting: false, onConfirm: b => calls.push(['confirm', b.id]), onReject: b => calls.push(['reject', b.id]) };
  let tree = DriverInterruptionPrompt(props);
  assert.match(words(tree), /Demande de descente.*\(\+1\).*Passager.*Urgence/);
  const buttons = all(tree).filter(node => node.type === 'Button');
  for (const button of buttons) { assert.ok(flatStyle(button.props.style).minHeight >= 44); button.props.onPress(); }
  assert.deepEqual(calls, [['reject', 'booking'], ['confirm', 'booking']]);
  tree = DriverInterruptionPrompt({ ...props, busy: true, confirming: true });
  assert.ok(all(tree).filter(node => node.type === 'Button').every(node => node.props.disabled));
  assert.equal(all(tree).filter(node => node.type === 'Spinner').length, 1);
});

test('passenger sees price before requesting, with a coordinate snapshot and duplicate-submit protection', async () => {
  const hooks = hookHarness(); const dialogs = []; const sent = []; let resolve;
  const pending = new Promise(done => { resolve = done; });
  const { usePassengerNavigationInterruption } = loader({ react: { ...React, ...hooks.react },
    '@/features/passenger-navigation/PassengerInterruptionFarePreview': { PassengerInterruptionFarePreview: 'Preview' },
  })('hooks/passenger-navigation/usePassengerNavigationInterruption.ts');
  const params = { isScreenActive: true, booking, trip: { status: 'ongoing' }, passengerLocation: { latitude: -4.3, longitude: 15.3 },
    isRequestingPassengerInterruption: false, showDialog: d => dialogs.push(d), refetchBooking: async () => {}, refetchTrip: async () => {},
    requestPassengerTripInterruption: payload => { sent.push(payload); return { unwrap: () => pending }; } };
  hooks.render(() => usePassengerNavigationInterruption(params)).openPassengerInterruptionDialog();
  assert.equal(sent.length, 0);
  assert.equal(dialogs[0].content.type, 'Preview');
  const snapshot = dialogs[0].content.props.coordinates;
  params.passengerLocation = { latitude: -4.4, longitude: 15.4 };
  hooks.render(() => usePassengerNavigationInterruption(params));
  const action = dialogs[0].actions.find(x => x.label === 'Urgence');
  const request = action.onPress(); await action.onPress();
  assert.equal(sent.length, 1); assert.deepEqual(sent[0].coordinates, snapshot);
  resolve({}); await request;
  assert.equal(dialogs.at(-1).title, 'Demande envoyée');
});
