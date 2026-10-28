const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture(t, create) {
  const h = hookHarness(), calls = [];
  let version = 1;
  const load = loader({
    react: h.react,
    '../../features/trip-detail/tripDetailModel': {
      getLocationText: () => '', getLocationCoordinatesObject: () => undefined,
    },
    '@/utils/routeHelpers': { isPointOnRoute: () => true },
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/store/api/driverFinanceApi': { useLazyTripPaymentOptionsQuery: () =>
      [() => ({ unwrap: async () => ({ availablePaymentModes: ['cash'] }) })] },
    '@/utils/errorHelpers': { getApiErrorMessage: () => 'error', isPassengerKycRequiredError: () => false },
  });
  const queue = load('services/tripLocationPermission.ts');
  const { useTripBookingSubmission } = load('hooks/trip-detail/useTripBookingSubmission.ts');
  const props = {
    isBooking: false, trip: { id: 'trip', departure: { lat: -4.32, lng: 15.3 }, arrival: { lat: -4.34, lng: 15.35 } },
    isValidatingDestination: false, bookingSeats: '1', isIdentityVerified: true, seatLimit: 3,
    setBookingModalError: value => calls.push(['error', value]), setBookingStep() {},
    passengerOriginManualAddress: '', passengerDestinationManualAddress: '', passengerOrigin: null, passengerDestination: null,
    setIsValidatingDestination() {}, resolveManualAddressSelection: async () => null, setPassengerOrigin() {}, setPassengerDestination() {},
    routeCoordinates: null, createBooking: () => ({ unwrap: create }), estimatedTotal: 1000, bookingPaymentMode: 'cash',
    setBookingModalVisible: value => calls.push(['form', value]), setPassengerOriginManualAddress() {},
    setPassengerDestinationManualAddress() {}, setShouldAutofillPassengerOrigin() {},
    openBookingSuccessModal: () => calls.push(['success']), refreshBookingLists: () => calls.push(['refresh']),
    refetchKycStatus() {}, openPassengerIdentityVerification() {}, activeBooking: null, cancelBookingMutation() {}, showDialog() {},
  };
  t.after(() => h.unmount());
  return { calls, queue, props, changeSession: () => { version++; },
    submit: () => h.render(() => useTripBookingSubmission(props)).handleConfirmBooking() };
}

test('booking success schedules optional location explanation only after confirmation and existing success UX', async t => {
  let resolve; const promise = new Promise(done => { resolve = done; });
  const f = fixture(t, () => promise); const pending = f.submit();
  assert.equal(f.queue.getTripLocationPermissionOffer(), null);
  resolve({ id: 'booked' }); await pending;
  assert.deepEqual(f.queue.getTripLocationPermissionOffer(), { kind: 'booking', id: 'booked', version: 1 });
  assert.deepEqual(f.calls.filter(call => call[0] !== 'error'), [['form', false], ['success'], ['refresh']]);
});

test('failed booking never offers location and does not show a false success', async t => {
  const f = fixture(t, async () => { throw Error('failed'); }); await f.submit();
  assert.equal(f.queue.getTripLocationPermissionOffer(), null);
  assert.equal(f.calls.some(c => c[0] === 'success'), false);
});

test('a booking confirmed for a departed account cannot prompt the next logged-in user', async t => {
  let resolve; const promise = new Promise(done => { resolve = done; });
  const f = fixture(t, () => promise); const pending = f.submit(); f.changeSession();
  resolve({ id: 'old-account-booking' }); await pending;
  assert.equal(f.queue.getTripLocationPermissionOffer(), null);
});
