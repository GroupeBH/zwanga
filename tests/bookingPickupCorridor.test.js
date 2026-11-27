const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

for (const [code, status, message] of [
  ['BOOKING_PICKUP_OFF_ROUTE', 400, /100 m maximum/],
  ['BOOKING_PICKUP_ROUTE_UNAVAILABLE', 503, /Itinéraire non vérifiable/],
  ['BOOKING_PICKUP_LOCATION_REQUIRED', 400, /Choisissez votre point/],
]) test(`booking reports ${code} without closing the form or losing its pickup`, async t => {
  const h = hookHarness(), effects = [], errors = [], sent = [];
  let rejected = true;
  const load = loader({ react: h.react,
    '../../features/trip-detail/tripDetailModel': { getLocationText: p => p?.title || '',
      getLocationCoordinatesObject: p => p ? { latitude: p.latitude, longitude: p.longitude } : undefined },
    '@/utils/routeHelpers': { isPointOnRoute: () => true },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/services/tripLocationPermission': { offerTripLocationPermission: () => effects.push('permission') },
    '@/services/analytics': { trackEvent: async () => effects.push('analytics') },
    '@/store/api/driverFinanceApi': { useLazyTripPaymentOptionsQuery: () => [() => ({
      unwrap: async () => ({ availablePaymentModes: ['cash'] }) })] },
  });
  const { useTripBookingSubmission } = load('hooks/trip-detail/useTripBookingSubmission.ts');
  const noop = () => {};
  const props = { trip: { id: 'trip', price: 3000, departure: { lat: -4.32, lng: 15.3 }, arrival: { lat: -4.34, lng: 15.35 } },
    isBooking: false, isValidatingDestination: false, bookingSeats: '1', isIdentityVerified: true, seatLimit: 3,
    passengerOrigin: { title: 'Point choisi', latitude: -4.33, longitude: 15.31 }, passengerDestination: null,
    passengerOriginManualAddress: '', passengerDestinationManualAddress: '', routeCoordinates: null,
    estimatedTotal: 3000, bookingPaymentMode: 'cash',
    setBookingModalError: e => errors.push(e), setBookingStep: noop, setIsValidatingDestination: noop,
    setPassengerOrigin: p => effects.push(['origin', p]), setPassengerDestination: noop,
    setPassengerOriginManualAddress: noop, setPassengerDestinationManualAddress: noop, setShouldAutofillPassengerOrigin: noop,
    setBookingModalVisible: value => effects.push(['visible', value]), openBookingSuccessModal: () => effects.push('success'),
    refreshBookingLists: () => effects.push('refresh'), refetchKycStatus: noop, openPassengerIdentityVerification: noop,
    activeBooking: null, showDialog: noop,
    createBooking: body => ({ unwrap: async () => { sent.push(body);
      if (rejected) throw { status, data: { code, message: 'Provider technical error' } };
      return { id: 'booking' }; } }),
  };
  t.after(() => h.unmount());
  const submit = () => h.render(() => useTripBookingSubmission(props)).handleConfirmBooking();
  await submit();
  assert.match(errors.at(-1), message);
  assert.deepEqual(effects, [], 'no success, permission prompt or cleared pickup after refusal');
  assert.equal(sent[0].passengerOriginCoordinates.latitude, -4.33);
  rejected = false;
  props.passengerOrigin = { ...props.passengerOrigin, latitude: -4.32, longitude: 15.3 };
  await submit();
  assert.equal(sent.length, 2, 'the user can correct the pickup and retry');
  assert.equal(sent[1].passengerOriginCoordinates.latitude, -4.32);
  assert.ok(effects.includes('success'));
});

test('pickup route API codes remain understandable across supported error envelopes', () => {
  const { getApiErrorMessage } = loader()('utils/errorHelpers.ts');
  for (const error of [{ code: 'BOOKING_PICKUP_OFF_ROUTE' },
    { data: { error: { code: 'BOOKING_PICKUP_OFF_ROUTE' } } },
    { error: { code: 'BOOKING_PICKUP_OFF_ROUTE' } }]) {
    assert.match(getApiErrorMessage(error, 'fallback'), /100 m maximum/);
  }
});
