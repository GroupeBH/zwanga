const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { getPickupArrivalEstimate } = loader()('features/passenger-navigation/pickupArrivalEstimate.ts');
const now = 1_800_000_000_000;
const booking = { id: 'booking', tripId: 'trip', status: 'accepted' };
const trip = { id: 'trip', status: 'ongoing' };
const routeInfo = { routeSignature: 'booking:pickup', fetchedAt: now, distanceMeters: 2400, durationSeconds: 600 };
const params = { booking, trip, online: true, hasDriverLocation: true, locationTimestamp: now,
  routeInfo, routeSignature: routeInfo.routeSignature, remainingDistanceMeters: 1200,
  isRouteUsable: true, loading: false, now };

test('pickup arrival uses remaining road distance, and never shows zero minutes or a confirmed arrival', () => {
  assert.equal(getPickupArrivalEstimate(params).value, 'Environ 5 min');
  assert.equal(getPickupArrivalEstimate({ ...params, remainingDistanceMeters: 2399 }).value, 'Environ 10 min');
  for (const distance of [0, 1, 239]) {
    const estimate = getPickupArrivalEstimate({ ...params, remainingDistanceMeters: distance });
    assert.equal(estimate.value, 'Moins d’une minute');
    assert.doesNotMatch(estimate.value, /arrivé|0 min/i);
  }
  assert.equal(getPickupArrivalEstimate({ ...params, routeInfo: { ...routeInfo, durationSeconds: 7200 } }).value, 'Environ 1 h');
  assert.equal(getPickupArrivalEstimate({ ...params, routeInfo: { ...routeInfo, durationSeconds: 7320 } }).value, 'Environ 1 h 1 min');
});

test('accepted reservations and bookings created from accepted requests share the same pickup estimate', () => {
  for (const linkedTrip of [trip, { ...trip, tripRequestId: 'request' }]) {
    assert.equal(getPickupArrivalEstimate({ ...params, trip: linkedTrip }).value, 'Environ 5 min');
  }
});

test('never estimates for unrelated, unaccepted, boarded, cancelled or completed trips', () => {
  for (const patch of [{ status: 'pending' }, { status: 'rejected' }, { status: 'cancelled' },
    { status: 'no_show' }, { status: 'completed' }, { pickedUp: true }, { pickedUpAt: 'date' },
    { pickedUpConfirmedByPassenger: true }, { droppedOff: true }, { droppedOffConfirmedByPassenger: true },
    { droppedOffAt: 'date' }, { tripId: 'other' }]) {
    assert.equal(getPickupArrivalEstimate({ ...params, booking: { ...booking, ...patch } }), null);
  }
  for (const status of ['completed', 'cancelled']) {
    assert.equal(getPickupArrivalEstimate({ ...params, trip: { ...trip, status } }), null);
  }
  assert.equal(getPickupArrivalEstimate({ ...params, booking: undefined }), null);
  assert.equal(getPickupArrivalEstimate({ ...params, trip: undefined }), null);
});

test('explains scheduled, paused, offline, absent and stale GPS states without inventing a delay', () => {
  const scenarios = [
    [{ trip: { ...trip, status: 'upcoming' } }, 'scheduled'],
    [{ trip: { ...trip, interruptionRequest: { status: 'confirmed' } } }, 'paused'],
    [{ online: false }, 'offline'], [{ hasDriverLocation: false }, 'waiting_location'],
    [{ locationTimestamp: undefined }, 'waiting_location'], [{ locationTimestamp: NaN }, 'stale'],
    [{ locationTimestamp: now - 120_000 }, 'stale'], [{ locationTimestamp: now + 60_000 }, 'stale'],
  ];
  for (const [patch, status] of scenarios) {
    const result = getPickupArrivalEstimate({ ...params, ...patch });
    assert.equal(result.status, status); assert.doesNotMatch(result.value, /\d+ min/);
  }
});

test('missing, straight-line, mismatched, old, off-route or invalid directions cannot become an ETA', () => {
  for (const patch of [{ routeInfo: null }, { isRouteUsable: false }, { remainingDistanceMeters: null },
    { remainingDistanceMeters: NaN }, { remainingDistanceMeters: -1 }, { remainingDistanceMeters: 4000 },
    ...[{ routeSignature: 'other' }, { fetchedAt: now - 180_000 }, { fetchedAt: now + 1 },
      { distanceMeters: 0 }, { distanceMeters: NaN }, { durationSeconds: 0 },
      { durationSeconds: Infinity }].map(change => ({ routeInfo: { ...routeInfo, ...change } }))]) {
    assert.equal(getPickupArrivalEstimate({ ...params, ...patch }).status, 'unavailable');
    assert.equal(getPickupArrivalEstimate({ ...params, ...patch, loading: true }).status, 'calculating');
  }
});

test('freshness expiry is local, and automatic route refresh stops offline, after pickup, blur and unmount', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now });
  const hooks = hookHarness(), calls = [];
  const { usePassengerPickupEstimate } = loader({ react: hooks.react })('hooks/passenger-navigation/usePassengerPickupEstimate.ts');
  const props = { ...params, isScreenActive: true, fetchRoute: async () => calls.push(Date.now()) };
  const render = () => hooks.render(() => usePassengerPickupEstimate(props));
  assert.equal(render().status, 'estimated');
  t.mock.timers.tick(59_999); assert.equal(calls.length, 0);
  t.mock.timers.tick(1); assert.equal(calls.length, 1);
  t.mock.timers.tick(60_001); assert.equal(render().status, 'stale'); assert.equal(calls.length, 1);
  props.locationTimestamp = Date.now(); props.routeInfo = { ...routeInfo, fetchedAt: Date.now() };
  assert.equal(render().status, 'estimated');
  for (const patch of [{ isScreenActive: false }, { online: false }, { booking: { ...booking, pickedUp: true } },
    { trip: { ...trip, status: 'upcoming' } }]) {
    const saved = { ...props };
    Object.assign(props, patch); render();
    const previous = calls.length; t.mock.timers.tick(61_000); assert.equal(calls.length, previous);
    Object.assign(props, saved, { locationTimestamp: Date.now(), routeInfo: { ...routeInfo, fetchedAt: Date.now() } });
    render();
  }
  hooks.unmount(); const previous = calls.length; t.mock.timers.tick(180_000); assert.equal(calls.length, previous);
});

const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
  ScrollView: 'ScrollView', useWindowDimensions: () => ({ width: 360, height: 780 }), StyleSheet: { create: x => x } };
const elements = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(elements) : [node, ...elements(node.props?.children)];
const words = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join(' ') : node?.props ? words(node.props.children) : '';
test('arrival banner is visible in the header even on expanded maps, wraps text and leaves contact/SOS intact', () => {
  const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/navigation/NavigationAssistanceButtons': { NavigationAssistanceButtons: 'Assistance' } });
  const { PassengerNavigationHeader } = load('features/passenger-navigation/PassengerNavigationHeader.tsx');
  const estimate = getPickupArrivalEstimate(params);
  const model = { pickupEstimate: estimate, data: { insets: { top: 20, left: 0, right: 0 }, trip },
    state: { isMapExpanded: true }, presentation: { tripStatus: 'waiting_pickup' }, tripActions: {} };
  const assistance = { openContacts() {}, openSos() {}, enabled: true };
  const header = PassengerNavigationHeader({ model, assistance });
  const node = elements(header).find(item => item.type?.name === 'PassengerPickupEstimateBanner');
  const banner = node.type(node.props);
  assert.match(words(banner), /Arrivée estimée du conducteur.*Environ 5 min/);
  assert.match(banner.props.accessibilityLabel, /prise en charge/);
  assert.doesNotMatch(words(banner), /prise en charge/);
  for (const text of elements(banner).filter(item => item.type === 'Text')) {
    assert.equal(text.props.numberOfLines, undefined); assert.notEqual(text.props.allowFontScaling, false);
  }
  assert.equal(banner.props.accessibilityLiveRegion, 'polite');
  const actions = elements(header).find(item => item.type === 'Assistance');
  assert.equal(actions.props.onContact, assistance.openContacts); assert.equal(actions.props.onSos, assistance.openSos);
  assert.equal(node.type({ estimate: null }), null);
});

test('the accepted-trip action opens the same passenger screen for upcoming, ongoing and request-created trips', () => {
  const { TripDetailActionsFooter } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '../screen-styles/app/trip/detail/index': { styles: {} } })('features/trip-detail/TripDetailActionsFooter.tsx');
  for (const status of ['upcoming', 'ongoing']) {
    for (const tripRequestId of [undefined, 'request']) {
      const calls = [];
      const props = { data: { trip: { ...trip, status, tripRequestId }, insets: { bottom: 0 }, router: { push: href => calls.push(href) } },
        access: { activeBookingStatus: { label: 'Acceptée' } }, activity: { activeBooking: booking },
        editor: {}, pricing: {}, payment: {}, bookingState: {}, bookingSubmission: {}, bookingLocation: {} };
      const tree = TripDetailActionsFooter(props);
      const button = elements(tree).find(item => item.props?.accessibilityLabel === 'Voir l’arrivée estimée du conducteur');
      assert.ok(button); assert.match(words(button), /Voir l’arrivée/);
      button.props.onPress(); assert.deepEqual(calls, ['/booking/navigate/booking']);
    }
  }
});

test('compact pickup panel keeps recovery without duplicate live state or misleading route distance', () => {
  const hooks = hookHarness();
  const { PassengerNavigationInfoCard } = loader({ react: { ...require('react'), ...hooks.react }, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { __esModule: true, default: { View: 'AnimatedView' }, FadeInUp: { duration: () => ({ delay: () => null }) } },
    '../screen-styles/app/booking/navigate/detail/index': { styles: {} },
    '@/features/ride-recovery/RideRecoveryControl': { RideRecoveryControl: 'Recovery' },
    '@/components/trip/PausedPassengerRideNotice': { PausedPassengerRideNotice: 'PausedNotice' },
  })('features/passenger-navigation/PassengerNavigationInfoCard.tsx');
  const props = { data: { booking: { ...booking, passengerOrigin: 'Départ', passengerDestination: 'Destination' },
    trip, isTripOngoing: true, insets: { bottom: 0 } }, state: { isSocketConnected: true },
    presentation: { displayedRouteDistance: '1,2 km', displayedRouteDuration: '5 min' }, interruption: {}, tripActions: {} };
  const render = () => hooks.render(() => PassengerNavigationInfoCard(props));
  const tree = render();
  assert.doesNotMatch(words(tree), /1,2 km|Avant prise en charge|En direct|5 min|Projection/);
  assert.ok(elements(tree).some(node => node.type === 'Recovery'));
  props.data.booking = { ...props.data.booking, pickedUp: true, pickedUpConfirmedByPassenger: true };
  const onboard = words(render());
  assert.match(onboard, /1,2 km.*restants.*5 min.*estimées/);
  assert.doesNotMatch(onboard, /Avant prise en charge/);
  hooks.unmount();
});
