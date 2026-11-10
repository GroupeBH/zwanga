const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const policy = loader()('features/trip-detail/bookingPriceProposal.ts');
const pending = { id: 'booking', tripId: 'trip', passengerId: 'passenger', passengerName: 'Passager test',
  status: 'pending', numberOfSeats: 2, proposedPricePerSeat: 2000, grossPaymentAmount: 6000, paymentAmount: 6000 };
const native = { View: 'View', Text: 'Text', TextInput: 'Input', Pressable: 'Button', TouchableOpacity: 'Button',
  ScrollView: 'Scroll', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } };
const all = tree => Array.isArray(tree) ? tree.flatMap(all) : React.isValidElement(tree) ? [tree, ...all(tree.props.children)] : [];
const words = tree => Array.isArray(tree) ? tree.map(words).join('') : React.isValidElement(tree) ? words(tree.props.children) : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';

test('price is optional, whole CDF per seat, lower than public fare and bounded', () => {
  for (const text of ['', ' ', '2500', '2800']) assert.equal(policy.bookingProposalError(text, 3000, 2), null);
  for (const text of ['1', '2000', '2499']) assert.match(policy.bookingProposalError(text, 3000, 2), /2 500/);
  for (const text of ['0', '-1', '1.5', '2e3', 'NaN', '3000', '5000', 'abc']) assert.ok(policy.bookingProposalError(text, 3000, 2));
  assert.ok(policy.bookingProposalError('2500', 3000, 100000));
  assert.ok(policy.bookingProposalError('2500', 3000, 1.5));
  assert.equal(policy.bookingAcceptanceArgument({ ...pending, proposedPricePerSeat: null }), 'booking');
  assert.deepEqual(policy.bookingAcceptanceArgument(pending), { id: 'booking', acceptedPricePerSeat: 2000 });
});

test('pending display uses proposal; confirmed or interrupted display uses server fare', () => {
  assert.match(policy.bookingFareLabel(pending, 3000).replace(/\s/g, ' '), /Proposition : 4 000 FC au total/);
  assert.match(policy.bookingFareLabel({ ...pending, status: 'accepted', grossPaymentAmount: 2800 }, 3000).replace(/\s/g, ' '), /^2 800 FC$/);
  assert.equal(policy.bookingPassengerTotal(pending, 3000), 4000);
  assert.equal(policy.bookingPassengerTotal({ ...pending, status: 'accepted', paymentAmount: 1600 }, 3000), 1600);
  assert.equal(policy.bookingPassengerTotal({ ...pending, status: 'completed', mixedPaymentAt: 'paid',
    paymentAmount: 1000, mixedTokenAmount: 600 }, 3000), 1600);
});

test('optional field opens and can revert to public price, with explicit per-seat wording', () => {
  const h = hookHarness(), changes = [];
  const { BookingPriceProposalField } = loader({ react: { ...React, ...h.react }, 'react-native': native })('features/trip-detail/BookingPriceProposalField.tsx');
  const props = { listedPrice: 3000, seats: 2, value: '', disabled: false, onChange: v => changes.push(v) };
  const render = () => h.render(() => BookingPriceProposalField(props));
  assert.equal(all(render()).some(n => n.type === 'Input'), false);
  all(render()).find(n => n.type === 'Button').props.onPress();
  let tree = render(); assert.match(words(tree), /par place/); assert.match(words(tree), /Aucun paiement maintenant/);
  all(tree).find(n => n.type === 'Input').props.onChangeText('2000'); assert.equal(changes.at(-1), '2000');
  props.value = '2000'; tree = render(); all(tree).find(n => n.type === 'Button').props.onPress();
  assert.equal(changes.at(-1), ''); h.unmount();
});

test('price estimates update with number of seats, without changing confirmed payment', () => {
  const h = hookHarness();
  const { useTripBookingPricing } = loader({ react: h.react })('hooks/trip-detail/useTripBookingPricing.ts');
  const props = { bookingSeats: '2', bookingProposedPrice: '2500', trip: { price: 3000 }, activeBooking: null };
  const render = () => h.render(() => useTripBookingPricing(props));
  assert.equal(render().estimatedTotal, 5000);
  props.bookingSeats = '3'; assert.equal(render().estimatedTotal, 7500);
  props.bookingProposedPrice = ''; assert.equal(render().estimatedTotal, 9000);
  h.unmount();
});

test('driver sees total proposal and an explicit acceptance button', () => {
  const { ManageTripBookings } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '../screen-styles/app/trip/manage/detail/index': { styles: {} },
    '@/features/driver-payments/ConfirmCashReceipt': { ConfirmCashReceipt: 'CashReceipt' },
    '@/components/trip/CompactCardAvatar': { CompactCardAvatar: 'Avatar' },
  })('features/manage-trip/ManageTripBookings.tsx');
  const accepted = [];
  const tree = ManageTripBookings({ tracking: { visibleBookings: [pending] },
    state: { trip: { id: 'trip', status: 'upcoming', price: 3000 }, router: { push() {} } }, actions: {},
    bookingsActions: { handleAcceptBooking: id => accepted.push(id) } });
  assert.match(words(tree).replace(/\s/g, ' '), /Proposition : 4 000 FC au total/);
  all(tree).find(n => n.type === 'Button' && words(n) === 'Accepter ce prix').props.onPress();
  assert.deepEqual(accepted, ['booking']);
});

test('notification proposal actions open price review, never accept an unseen price', () => {
  const { driverNotificationActions } = loader()('features/notifications/driverNotificationCard.ts');
  const actions = driverNotificationActions('booking', { ridePriceKind: 'budget' });
  assert.deepEqual(actions.map(a => a.pressAction.id), ['driver-decline', 'default']);
  assert.match(actions[1].title, /prix proposé/);
  assert.equal(driverNotificationActions('booking', {}).at(-1).pressAction.id, 'driver-accept');
});

test('booking creation sends the proposal separately, and invalid inputs never send HTTP', async () => {
  const h = hookHarness(), sent = [], errors = [];
  let paymentReads = 0;
  const load = loader({ react: h.react,
    '../../features/trip-detail/tripDetailModel': { getLocationText: () => '', getLocationCoordinatesObject: () => undefined },
    '@/utils/routeHelpers': { isPointOnRoute: () => true },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/services/tripLocationPermission': { offerTripLocationPermission() {} },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/store/api/driverFinanceApi': { useLazyTripPaymentOptionsQuery: () => [() => ({ unwrap: async () => { paymentReads++; return { availablePaymentModes: ['cash'] }; } })] },
    '@/utils/errorHelpers': { getApiErrorMessage: () => 'error', isPassengerKycRequiredError: () => false },
  });
  const { useTripBookingSubmission } = load('hooks/trip-detail/useTripBookingSubmission.ts');
  const noop = () => {};
  const props = { isBooking: false, trip: { id: 'trip', price: 3000, departure: { lat: -4.32, lng: 15.3 }, arrival: { lat: -4.34, lng: 15.35 } },
    isValidatingDestination: false, bookingSeats: '2', bookingProposedPrice: '2500', isIdentityVerified: true, seatLimit: 3,
    setBookingModalError: e => errors.push(e), setBookingStep: noop, passengerOriginManualAddress: '', passengerDestinationManualAddress: '',
    passengerOrigin: null, passengerDestination: null, setIsValidatingDestination: noop, setPassengerOrigin: noop, setPassengerDestination: noop,
    routeCoordinates: null, createBooking: body => ({ unwrap: async () => { sent.push(body); return { id: 'booking' }; } }),
    estimatedTotal: 5000, bookingPaymentMode: 'cash', setBookingModalVisible: noop, setPassengerOriginManualAddress: noop,
    setPassengerDestinationManualAddress: noop, setShouldAutofillPassengerOrigin: noop, openBookingSuccessModal: noop,
    refreshBookingLists: noop, refetchKycStatus: noop, openPassengerIdentityVerification: noop, activeBooking: null, showDialog: noop };
  const submit = () => h.render(() => useTripBookingSubmission(props)).handleConfirmBooking();
  await submit(); assert.equal(sent.length, 1); assert.equal(sent[0].proposedPricePerSeat, 2500);
  assert.equal(sent[0].numberOfSeats, 2); assert.equal('paymentAmount' in sent[0], false);
  props.bookingProposedPrice = '0'; await submit(); assert.equal(sent.length, 1); assert.match(errors.at(-1), /supérieur à zéro/);
  props.bookingProposedPrice = ''; await submit(); assert.equal('proposedPricePerSeat' in sent[1], false);
  const readsBefore = paymentReads;
  for (const invalid of ['', '0', '1.5', '2abc', 'NaN', 'Infinity', '4']) {
    props.bookingSeats = invalid; await submit();
    assert.equal(sent.length, 2); assert.equal(paymentReads, readsBefore, 'one-panel confirmation validates seats before HTTP');
  }
  props.bookingSeats = '3'; props.isIdentityVerified = false; await submit();
  assert.equal(sent.length, 2); assert.equal(paymentReads, readsBefore, 'identity restrictions survive removal of wizard steps');
  h.unmount();
});
