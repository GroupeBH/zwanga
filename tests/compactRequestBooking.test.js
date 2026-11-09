const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', Pressable: 'Button',
  ScrollView: 'Scroll', KeyboardAvoidingView: 'KeyboardView', ActivityIndicator: 'Spinner', Platform: { OS: 'android' }, StyleSheet: { create: x => x } };
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree)
  ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');
const baseMocks = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/components/forms/FormLayout': { FormModal: 'Modal' }, '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
  '@/components/PassengerSeatNotice': { PassengerSeatNotice: 'SeatNotice' } };

test('reservation can be confirmed from the first panel; duplicate taps and closing during verification are blocked', async t => {
  const h = hookHarness(); t.after(() => h.unmount());
  let done, submissions = 0, closed = 0;
  const wait = new Promise(resolve => { done = resolve; });
  const Modal = loader({ ...baseMocks, react: { ...React, ...h.react }, './TripBookingSteps': { TripBookingSteps: 'Form' } })
    ('features/trip-detail/TripBookingModal.tsx').TripBookingModal;
  const props = { bookingStep: 1, bookingModalVisible: true, insets: { bottom: 0 }, bookingProposedPrice: '',
    handleConfirmBooking: async () => { submissions++; await wait; }, closeBookingModal: () => { closed++; } };
  const render = () => h.render(() => Modal(props));
  let tree = render();
  assert.doesNotMatch(words(tree), /Suivant|Prévisualisation|Retour/);
  const button = nodes(tree).find(n => n.type === 'Button' && words(n) === 'Confirmer la réservation');
  assert.ok(button); button.props.onPress(); button.props.onPress();
  tree = render(); tree.props.onRequestClose();
  assert.equal(submissions, 1); assert.equal(closed, 0);
  assert.equal(nodes(tree).find(n => n.type === 'Form').props.isBooking, true);
  done(); await new Promise(resolve => setImmediate(resolve));
  tree = render(); tree.props.onRequestClose(); assert.equal(closed, 1);
  props.bookingProposedPrice = '2000'; assert.match(words(render()), /Envoyer mon prix/);
});

test('single booking form shows the route, seats, total and selected payment; custom points and price proposal remain editable', () => {
  const changes = [], query = { currentData: { availablePaymentModes: ['cash'] } };
  const Form = loader({ ...baseMocks, react: React,
    './tripDetailModel': { getTripPaymentModeLabel: mode => mode === 'cash' ? 'Espèces' : 'Jetons',
      TRIP_PAYMENT_MODE_OPTIONS: [{ id: 'cash', label: 'Espèces', icon: 'cash-outline' }, { id: 'points', label: 'Jetons', icon: 'wallet-outline' }] },
    '@/components/forms/FormDisclosure': { FormDisclosure: 'Disclosure' },
    './BookingPriceProposalField': { BookingPriceProposalField: 'PriceProposal' },
    '@/store/api/driverFinanceApi': { useTripPaymentOptionsQuery: () => query },
  })('features/trip-detail/TripBookingSteps.tsx').TripBookingSteps;
  const props = { bookingStep: 1, viewportHeight: 800, trip: { id: 'trip', price: 3000 }, bookingSeats: '1', seatLimit: 2,
    estimatedTotal: 3000, bookingPaymentMode: 'cash', passengerOriginDisplay: 'Gombe', passengerDestinationDisplay: 'Lemba',
    passengerOriginManualAddress: '', passengerDestinationManualAddress: '',
    setPassengerOriginManualAddress: x => changes.push(['text', x]), setShouldAutofillPassengerOrigin: x => changes.push(['autofill', x]),
    setPassengerOrigin: x => changes.push(['origin', x]), setBookingProposedPrice() {},
    openBookingLocationPicker: x => changes.push(['picker', x]) };
  let tree = Form(props); assert.match(words(tree), /Gombe/); assert.match(words(tree), /Lemba/);
  assert.match(words(tree).replace(/\s/g, ''), /3000FC/);
  assert.equal(nodes(tree).find(n => n.type === 'PriceProposal').props.listedPrice, 3000);
  const payment = nodes(tree).find(n => n.type === 'Disclosure' && n.props.title === 'Paiement');
  assert.match(payment.props.summary, /Espèces/); assert.equal(payment.props.forceOpen, false);
  const map = nodes(tree).find(n => n.props.accessibilityLabel === 'Modifier le point de départ'); map.props.onPress();
  const input = nodes(tree).find(n => n.props.accessibilityLabel === 'Adresse de départ'); input.props.onChangeText('Gare');
  assert.deepEqual(changes, [['picker', 'origin'], ['text', 'Gare'], ['autofill', false], ['origin', null]]);
  query.currentData.availablePaymentModes = ['points']; tree = Form(props);
  assert.equal(nodes(tree).find(n => n.type === 'Disclosure' && n.props.title === 'Paiement').props.forceOpen, true);
});

test('disclosures keep a readable summary, reveal controls on tap and never hide validation errors', t => {
  const h = hookHarness(); t.after(() => h.unmount());
  const Disclosure = loader({ ...baseMocks, react: { ...React, ...h.react } })('components/forms/FormDisclosure.tsx').FormDisclosure;
  const props = { title: 'Quand partir ?', summary: 'Demain à 10:00', children: React.createElement('DatePicker') };
  const render = () => h.render(() => Disclosure(props));
  let tree = render(); assert.match(words(tree), /Demain/); assert.equal(nodes(tree).some(n => n.type === 'DatePicker'), false);
  nodes(tree).find(n => n.type === 'Button').props.onPress(); tree = render();
  assert.equal(nodes(tree).some(n => n.type === 'DatePicker'), true);
  nodes(tree).find(n => n.type === 'Button').props.onPress(); props.forceOpen = true; tree = render();
  assert.equal(nodes(tree).find(n => n.type === 'Button').props.accessibilityState.expanded, true);
});

test('request editor keeps saved price and route visible while secondary controls collapse; invalid schedule is expanded', () => {
  const Fields = loader({ ...baseMocks, react: React,
    '@/components/forms/FormDisclosure': { FormDisclosure: 'Disclosure' },
    '@react-native-community/datetimepicker': { __esModule: true, default: 'DatePicker' },
    './RequestEditVehicleOptions': { RequestEditVehicleOptions: 'Vehicles' },
  })('features/request-detail/RequestEditFields.tsx').RequestEditFields;
  const props = { editAddressInputMode: 'map', editDepartureAddress: 'Gombe', editArrivalAddress: 'Lemba',
    editVehicleTypes: ['car'], editVehicleOptions: [], parsedEditNumberOfSeats: 1, editSeatCapacity: 4,
    editNumberOfSeats: '1', editMaxPricePerSeat: '1700', isEditBudgetValid: true, parsedEditBudget: 1700,
    editDepartureDateMin: new Date('2026-11-07T10:00:00Z'), editDepartureDateMax: new Date('2026-11-07T11:00:00Z') };
  let tree = Fields(props); assert.equal(nodes(tree).some(n => n.type.name === 'RequestTotalBudgetInput' && n.props.pricePerSeat === '1700' && n.props.seats === 1), true);
  assert.match(words(tree), /Gombe/); assert.match(words(tree), /Lemba/);
  const disclosures = nodes(tree).filter(n => n.type === 'Disclosure');
  assert.equal(disclosures.length, 3); assert.equal(disclosures[0].props.forceOpen, false);
  props.editScheduleError = 'Choisissez une heure future.'; tree = Fields(props);
  assert.equal(nodes(tree).find(n => n.type === 'Disclosure').props.forceOpen, true);
});
