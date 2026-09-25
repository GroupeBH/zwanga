const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const nativeMocks = { 'react-native': { Platform: { OS: 'ios' }, StyleSheet: { create: value => value } },
  'react-native-maps': { PROVIDER_GOOGLE: 'google' }, 'expo-location': {} };
const booking = { id: 'group', tripId: 'trip', passengerId: 'holder', status: 'accepted', numberOfSeats: 3 };
const vehicle = { brand: ' Toyota ', model: 'Yaris', color: 'rouge', licensePlate: '1234AB01' };
const flush = () => new Promise(resolve => setImmediate(resolve));

test('pickup reminder uses the trip vehicle and explicitly handles missing information', () => {
  const { pickupVehicleReminder, passengerPickupMessage } = loader()('features/navigation/pickupAwareness.ts');
  const reminder = pickupVehicleReminder({ vehicle, driver: { vehicle: { brand: 'Wrong' } } });
  assert.match(reminder, /Toyota Yaris.*rouge.*1234AB01/);
  assert.doesNotMatch(reminder, /Wrong/);
  assert.match(passengerPickupMessage('driver_near_pickup', 300, reminder), /300 m.*Toyota Yaris.*rouge.*1234AB01/);
  const fallback = pickupVehicleReminder({ vehicleInfo: 'Véhicule ancien' });
  assert.match(fallback, /à vérifier avec le conducteur.*Couleur : non renseignée.*Plaque : non renseignée/);
  assert.doesNotMatch(fallback, /Véhicule ancien/, 'a trip description is not a vehicle identity');
  assert.match(pickupVehicleReminder(), /à vérifier avec le conducteur/);
  assert.doesNotMatch(passengerPickupMessage('driver_near_pickup', NaN), /NaN/);
});

function passengerNotices() {
  const hooks = hookHarness(), shown = [], pushed = [], spoken = [];
  const { usePassengerNavigationNotices } = loader({ ...nativeMocks, react: hooks.react,
    '@/services/pushNotifications': { displayNotification: async (...args) => pushed.push(args) },
    '@/services/passengerBackgroundLocationTask': { stopPassengerBackgroundLocationTracking() {} },
    '@/utils/navigationSpeech': { NavigationSpeech: { stop: async () => {}, speak: text => spoken.push(text) } },
  })('hooks/passenger-navigation/usePassengerNavigationNotices.ts');
  const props = { bookingId: booking.id, booking, trip: { id: 'trip', vehicle }, isScreenActive: true,
    isMountedRef: { current: true }, presentedPickupNoticeKeysRef: { current: new Set() },
    highestPickupNoticePriorityRef: { current: new Map() }, hasDisplayedDriverNearNotificationRef: { current: false },
    setPickupNotice: notice => shown.push(notice) };
  const render = () => hooks.render(() => usePassengerNavigationNotices(props));
  const emit = (patch = {}) => render().presentPickupNotice({ type: 'driver_near_pickup', bookingId: booking.id,
    tripId: 'trip', distanceMeters: 300, ...patch });
  return { hooks, props, emit, render, shown, pushed, spoken };
}

test('passenger gets one vehicle reminder for the booking holder, not one per seat or GPS update', async () => {
  const h = passengerNotices();
  h.emit(); h.emit({ distanceMeters: 250 }); h.emit();
  await flush();
  assert.equal(h.shown.length, 1); assert.equal(h.pushed.length, 1); assert.equal(h.spoken.length, 1);
  assert.match(h.pushed[0][1], /300 m.*Toyota Yaris.*rouge.*1234AB01/);
  assert.match(h.spoken[0], /Toyota Yaris.*rouge.*1234AB01/);
  assert.equal(h.props.booking.pickedUp, undefined, 'an approach notice never boards the group');
  h.hooks.unmount();
});

test('passenger readiness does not swallow approach; actual pickup arrival prevents a late approach alert', async () => {
  const h = passengerNotices();
  h.emit({ type: 'parties_nearby', distanceMeters: 2 }); h.emit();
  await flush();
  assert.deepEqual(h.shown.map(notice => notice.type), ['parties_nearby', 'driver_near_pickup']);
  assert.equal(h.spoken.length, 1, 'only the latest notice is spoken after asynchronous speech stop');
  const arrived = passengerNotices();
  arrived.emit({ type: 'driver_arrived_pickup', distanceMeters: 70 }); arrived.emit();
  assert.deepEqual(arrived.shown.map(notice => notice.type), ['driver_arrived_pickup']);
  h.hooks.unmount(); arrived.hooks.unmount();
});

test('passenger ignores foreign, boarded, cancelled, dropped-off and background events', async () => {
  const h = passengerNotices();
  h.emit({ bookingId: 'other' }); h.emit({ tripId: 'other' });
  for (const patch of [{ pickedUp: true }, { pickedUpConfirmedByPassenger: true }, { droppedOff: true },
    { droppedOffConfirmedByPassenger: true }, { status: 'cancelled' }]) {
    h.props.booking = { ...booking, ...patch }; h.emit();
  }
  h.props.booking = booking; h.props.isScreenActive = false; h.emit();
  assert.equal(h.shown.length, 0); assert.equal(h.pushed.length, 0);
  h.props.isScreenActive = true; h.emit();
  h.props.isScreenActive = false; h.render();
  h.props.isScreenActive = true; h.render();
  await flush(); assert.equal(h.spoken.length, 0, 'leaving the screen invalidates queued speech even after returning');
  h.hooks.unmount();
});

test('local passenger threshold includes 300m, preserves 5m readiness and suspends notices when inactive', () => {
  const hooks = hookHarness(), events = []; let distance = 301;
  const { usePassengerDriverCameraTracking } = loader({ ...nativeMocks, react: hooks.react,
    '@/utils/routeHelpers': { calculateDistance: () => distance / 1000, getRouteAlignedPosition: () => ({ heading: 0 }) },
  })('hooks/passenger-navigation/usePassengerDriverCameraTracking.ts');
  const props = { booking, tripId: 'trip', isTripOngoing: true, isScreenActive: true, routeCoordinates: [],
    passengerLocation: { latitude: -4.3, longitude: 15.3 }, presentPickupNotice: event => events.push(event) };
  const render = () => { props.driverLocation = { latitude: -4.3, longitude: 15.301 }; hooks.render(() => usePassengerDriverCameraTracking(props)); };
  render(); assert.equal(events.length, 0);
  distance = 300; render(); assert.equal(events.at(-1).type, 'driver_near_pickup'); assert.equal(events.at(-1).distanceMeters, 300);
  distance = 5; render(); assert.equal(events.at(-1).type, 'parties_nearby');
  const count = events.length;
  props.isScreenActive = false; render(); assert.equal(events.length, count);
  props.isScreenActive = true; props.booking = { ...booking, status: 'cancelled' }; render(); assert.equal(events.length, count);
  props.booking = { ...booking, pickedUp: true }; render(); assert.equal(events.length, count);
  hooks.unmount();
});

test('driver approach works at 300m per booking; 80m arrival and boarded exclusions remain unchanged', () => {
  const hooks = hookHarness(), events = []; let distance = 301;
  const { useDriverRouteProgressTracking } = loader({ ...nativeMocks, react: hooks.react,
    '@/utils/routeHelpers': { calculateDistance: () => distance / 1000 },
  })('hooks/driver-navigation/useDriverRouteProgressTracking.ts');
  const waypoints = [booking, { ...booking, id: 'second' }, { ...booking, id: 'boarded', pickedUp: true }].map(item => ({
    id: `${item.id}:pickup`, type: 'pickup', booking: item, passenger: { id: item.passengerId }, location: { lat: -4.3, lng: 15.3 },
  }));
  const props = { data: { isTripOngoing: true, tripId: 'trip' }, refs: { currentLocationRef: { current: null } },
    mapState: { waypoints, lastTripCompletionCheckCoordinateRef: { current: null }, livePassengerLocations: {} },
    notices: { presentPickupNotice: event => events.push(event) }, completion: {} };
  const render = () => { props.mapState.currentLocation = { coords: { latitude: -4.3, longitude: 15.301 } };
    hooks.render(() => useDriverRouteProgressTracking(props)); };
  render(); assert.equal(events.length, 0);
  distance = 300; render();
  assert.deepEqual(events.map(event => [event.bookingId, event.type]), [['group', 'driver_near_pickup'], ['second', 'driver_near_pickup']]);
  distance = 80; render(); assert.equal(events.at(-1).type, 'driver_arrived_pickup');
  assert.equal(events.some(event => event.bookingId === 'boarded'), false);
  assert.equal(booking.pickedUp, undefined); hooks.unmount();
});

test('home approach wording is role-specific and reminds the passenger of the assigned vehicle', () => {
  const { getHomeTrackingDialog } = loader({ '@/features/navigation/PickupVehicleDetails': {
    PickupVehicleDetails: 'VehicleDetails',
  } })('features/home/homeTrackingDialogs.ts');
  const event = { type: 'driver_near_pickup', bookingId: booking.id, tripId: 'trip', distanceMeters: 300 };
  const tripBooking = { ...booking, passengerName: 'Titulaire', trip: { id: 'trip', vehicle } };
  const passenger = getHomeTrackingDialog(event, tripBooking, false);
  assert.match(passenger.message, /300 m/);
  assert.equal(passenger.content.props.trip.vehicle, vehicle);
  const driver = getHomeTrackingDialog(event, tripBooking, true);
  assert.equal(driver.title, 'Prise en charge à proximité'); assert.match(driver.message, /Titulaire.*300 m/);
});
