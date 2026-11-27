const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { bookingReferenceContext, bookingReferenceError } = loader()('features/trip-detail/bookingReferences.ts');
const point = (title, latitude = -4.31, longitude = 15.31) => ({ title, address: title, latitude, longitude });
const trip = { id: 'trip', price: 3000,
  departure: { name: 'Gombe', address: 'Gombe', lat: -4.31, lng: 15.31, reference: 'Portail de départ' },
  arrival: { name: 'Limete', address: 'Limete', lat: -4.32, lng: 15.32, reference: 'Pharmacie à l’arrivée' } };
const noop = () => {};

test('booking uses the same locality / precise address rule as publication and requests', () => {
  for (const name of ['Gombe', 'Mont Ngafula, Kinshasa', 'Ma position actuelle', '-4.31, 15.31']) {
    assert.equal(bookingReferenceContext(trip, 'origin', point(name), '').required, true, name);
  }
  for (const name of ['Avenue de la Paix', '12 Avenue de Démonstration', 'Marché de Démonstration']) {
    assert.equal(bookingReferenceContext(trip, 'origin', point(name), '').required, false, name);
  }
  assert.equal(bookingReferenceContext(trip, 'origin', { ...point('Kenge'), placeTypes: ['locality'] }, '').required, true);
  assert.equal(bookingReferenceContext(trip, 'origin', { ...point('Gombe'), placeTypes: ['route'] }, 'Limete').required, true);
});

test('trip references are inherited only for the original stops, not another nearby pickup or typed address', () => {
  assert.equal(bookingReferenceContext(trip, 'origin', null, '').inheritedReference, 'Portail de départ');
  assert.equal(bookingReferenceContext(trip, 'destination', point('Limete', -4.32, 15.32), '').inheritedReference, 'Pharmacie à l’arrivée');
  assert.equal(bookingReferenceContext(trip, 'origin', point('Gombe', -4.3101, 15.31), '').inheritedReference, '');
  assert.equal(bookingReferenceContext(trip, 'origin', point('Gombe'), 'Gombe').inheritedReference, '');
  assert.equal(bookingReferenceContext({ ...trip, departure: { ...trip.departure, hasCoordinates: false } }, 'origin', point('Gombe'), '').inheritedReference, '');
});

test('missing departure, missing arrival and overlong references have distinct feedback', () => {
  const origin = bookingReferenceContext(trip, 'origin', null, '');
  const destination = bookingReferenceContext(trip, 'destination', null, '');
  assert.match(bookingReferenceError(origin, '  ', destination, ''), /au départ/);
  assert.match(bookingReferenceError(origin, 'Portail', destination, '  '), /à l’arrivée/);
  assert.equal(bookingReferenceError(origin, 'Portail', destination, 'Pharmacie'), null);
  assert.match(bookingReferenceError(origin, 'x'.repeat(201), destination, 'Pharmacie'), /200 caractères/);
});

function referenceFixture(t) {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const useReferences = loader({ react: hooks.react })('hooks/trip-detail/useTripBookingReferences.ts').useTripBookingReferences;
  const props = { trip, passengerOrigin: null, passengerOriginManualAddress: '',
    passengerDestination: point('Limete', -4.32, 15.32), passengerDestinationManualAddress: '' };
  return { props, render: () => hooks.render(() => useReferences(props)) };
}
test('editing a stop invalidates its old reference without erasing the other stop', t => {
  const f = referenceFixture(t); f.render().origin.onChangeText('Entrée secondaire');
  assert.equal(f.render().origin.value, 'Entrée secondaire');
  f.props.passengerOrigin = point('Gombe', -4.315, 15.315);
  assert.equal(f.render().origin.value, '');
  assert.equal(f.render().destination.value, 'Pharmacie à l’arrivée');
  f.render().origin.onChangeText('Bâtiment A');
  f.props.passengerOriginManualAddress = 'Gombe';
  assert.equal(f.render().origin.value, '');
  f.render().origin.onChangeText('Bâtiment B');
  f.props.passengerOriginManualAddress = 'Limete';
  assert.equal(f.render().origin.value, '');
});
test('manual references survive their own geocoding, but not a new trip or a new form', t => {
  const f = referenceFixture(t); f.props.passengerOriginManualAddress = 'Kenge';
  f.render().origin.onChangeText('Devant le commerce');
  f.props.passengerOrigin = { ...point('Kenge'), placeTypes: ['locality'] };
  assert.equal(f.render().origin.value, 'Devant le commerce');
  assert.equal(f.render().origin.required, true);
  f.props.trip = { ...trip, id: 'another-trip' };
  assert.equal(f.render().origin.value, '');
  f.render().origin.onChangeText('Autre repère'); f.render().reset();
  assert.equal(f.render().origin.value, '');
});
test('an intentionally cleared inherited reference is not silently restored', t => {
  const f = referenceFixture(t); f.render().destination.onChangeText('');
  assert.equal(f.render().destination.value, '');
  assert.equal(f.render().destination.required, true);
});

function submissionFixture(t) {
  const hooks = hookHarness(), sent = [], errors = [], events = [];
  t.after(() => hooks.unmount());
  const load = loader({ react: hooks.react,
    '../../features/trip-detail/tripDetailModel': {
      getLocationText: (selection, manual) => manual.trim() || selection?.title || selection?.address || '',
      getLocationCoordinatesObject: p => p ? { latitude: p.latitude, longitude: p.longitude } : undefined,
    },
    '@/utils/routeHelpers': { isPointOnRoute: () => true },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/services/tripLocationPermission': { offerTripLocationPermission: noop },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/store/api/driverFinanceApi': { useLazyTripPaymentOptionsQuery: () => [() => {
      events.push('payment'); return { unwrap: async () => ({ availablePaymentModes: ['cash'] }) }; }] },
  });
  const useSubmission = load('hooks/trip-detail/useTripBookingSubmission.ts').useTripBookingSubmission;
  const props = { trip, isBooking: false, isValidatingDestination: false, bookingSeats: '1',
    isIdentityVerified: true, seatLimit: 3, estimatedTotal: 3000, bookingPaymentMode: 'cash',
    passengerOrigin: point('Gombe', -4.315, 15.31), passengerDestination: point('Limete', -4.325, 15.32),
    passengerOriginManualAddress: '', passengerDestinationManualAddress: '',
    passengerOriginReference: '', passengerDestinationReference: '', routeCoordinates: null,
    setBookingModalError: value => errors.push(value), setBookingStep: noop, setIsValidatingDestination: noop,
    setPassengerOrigin: p => { props.passengerOrigin = p; }, setPassengerDestination: p => { props.passengerDestination = p; },
    resolveManualAddressSelection: async () => ({ ...point('Kenge'), placeTypes: ['locality'] }),
    createBooking: body => ({ unwrap: async () => { sent.push(body); return { id: 'booking' }; } }),
    setBookingModalVisible: noop, setPassengerOriginManualAddress: noop, setPassengerDestinationManualAddress: noop,
    setShouldAutofillPassengerOrigin: noop, openBookingSuccessModal: () => events.push('success'),
    refreshBookingLists: noop, refetchKycStatus: noop, openPassengerIdentityVerification: noop,
    activeBooking: null, showDialog: noop,
  };
  return { props, sent, errors, events, submit: () => hooks.render(() => useSubmission(props)).handleConfirmBooking() };
}
test('both required references are checked before payment options or reservation API calls', async t => {
  const f = submissionFixture(t); await f.submit();
  assert.match(f.errors.at(-1), /au départ/); assert.deepEqual(f.events, []); assert.equal(f.sent.length, 0);
  f.props.passengerOriginReference = '  Arrêt de bus  '; await f.submit();
  assert.match(f.errors.at(-1), /à l’arrivée/); assert.deepEqual(f.events, []);
  f.props.passengerDestinationReference = '  Portail vert  '; await f.submit();
  assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].passengerOriginReference, 'Arrêt de bus');
  assert.equal(f.sent[0].passengerDestinationReference, 'Portail vert');
  assert.deepEqual(f.sent[0].passengerOriginCoordinates, { latitude: -4.315, longitude: 15.31 });
  assert.equal(f.sent[0].paymentMode, 'cash');
});
test('free bookings also require references, while precise streets can omit them', async t => {
  const f = submissionFixture(t); f.props.estimatedTotal = 0; await f.submit(); assert.equal(f.sent.length, 0);
  f.props.passengerOrigin = point('Avenue du Départ'); f.props.passengerDestination = point('Avenue de l’Arrivée');
  await f.submit(); assert.equal(f.sent.length, 1); assert.equal(f.sent[0].passengerOriginReference, undefined);
  assert.equal(f.events.includes('payment'), false);
});
test('the destination reference is sent even when the default arrival coordinates are omitted', async t => {
  const f = submissionFixture(t); f.props.passengerOrigin = null;
  f.props.passengerDestination = point('Limete', -4.32, 15.32);
  f.props.passengerOriginReference = undefined; f.props.passengerDestinationReference = undefined;
  await f.submit(); assert.equal(f.sent.length, 1);
  assert.equal(f.sent[0].passengerOriginReference, 'Portail de départ');
  assert.equal(f.sent[0].passengerDestinationReference, 'Pharmacie à l’arrivée');
  assert.equal(f.sent[0].passengerDestinationCoordinates, undefined);
});
test('manual geocoding revealing a locality requires its reference before creation', async t => {
  const f = submissionFixture(t); f.props.passengerOrigin = null; f.props.passengerOriginManualAddress = 'Kenge';
  f.props.passengerDestinationReference = 'Pharmacie';
  await f.submit(); assert.equal(f.sent.length, 0); assert.match(f.errors.at(-1), /au départ/);
  assert.equal(f.props.passengerOrigin.title, 'Kenge');
  assert.equal(bookingReferenceContext(trip, 'origin', f.props.passengerOrigin, 'Kenge').required, true);
  f.props.passengerOriginReference = 'Marché central'; await f.submit();
  assert.equal(f.sent.length, 1); assert.equal(f.sent[0].passengerOriginReference, 'Marché central');
});
test('a reference does not bypass the server pickup corridor refusal', async t => {
  const f = submissionFixture(t); f.props.passengerOriginReference = 'Commerce'; f.props.passengerDestinationReference = 'École';
  f.props.createBooking = () => ({ unwrap: async () => { throw { status: 400, data: { code: 'BOOKING_PICKUP_OFF_ROUTE' } }; } });
  await f.submit(); assert.match(f.errors.at(-1), /100 m maximum/); assert.ok(!f.events.includes('success'));
});

test('the form puts both reference fields next to their stops inside scrollable content', () => {
  const native = { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ScrollView: 'Scroll', StyleSheet: { create: v => v } };
  const Form = loader({ react: React, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/components/trip-request/RequestReferenceField': { RequestReferenceField: 'Reference' },
    '@/components/PassengerSeatNotice': { PassengerSeatNotice: 'SeatNotice' },
    '@/components/forms/FormDisclosure': { FormDisclosure: 'Disclosure' },
    './BookingPriceProposalField': { BookingPriceProposalField: 'PriceProposal' },
  })('features/trip-detail/TripBookingSteps.tsx').TripBookingSteps;
  const calls = [];
  const props = { trip, viewportHeight: 568, bookingSeats: '1', seatLimit: 2, isBooking: true,
    bookingReferences: { origin: { value: '', required: true, onChangeText: v => calls.push(['origin', v]) },
      destination: { value: 'École', required: false, onChangeText: v => calls.push(['destination', v]) } } };
  const nodes = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
  const tree = Form(props); assert.equal(tree.type, 'Scroll');
  const fields = nodes(tree).filter(n => n.type === 'Reference');
  assert.equal(fields.length, 2); assert.equal(fields[0].props.required, true); assert.equal(fields[1].props.required, false);
  assert.ok(fields.every(f => f.props.disabled && f.props.keepHintVisible));
  fields[0].props.onChangeText('Portail'); assert.deepEqual(calls, [['origin', 'Portail']]);
});
