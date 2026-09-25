const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const React = require('react');

const vehicle = { id: 'vehicle', brand: 'Toyota', model: 'Yaris', color: 'rouge', licensePlate: '1234AB01' };
const trip = { id: 'trip', status: 'ongoing', vehicleId: vehicle.id, vehicle };
const booking = { id: 'booking', tripId: trip.id, passengerId: 'holder', passengerName: 'Titulaire',
  numberOfSeats: 3, status: 'accepted', trip };
const types = ['driver_arrived_pickup', 'parties_nearby'];
const uiMocks = { '@/features/navigation/PickupVehicleDetails': { PickupVehicleDetails: 'VehicleDetails' } };
const { PickupVehicleDetails } = loader({ 'react-native': { View: 'View', Text: 'Text', StyleSheet: { create: x => x } },
  '@expo/vector-icons': { Ionicons: 'Icon' } })('features/navigation/PickupVehicleDetails.tsx');
const textOf = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(textOf).join(' ') : node?.props ? textOf(node.props.children) : '';
const vehicleText = data => textOf(PickupVehicleDetails({ trip: data }));
const event = type => ({ type, bookingId: booking.id, tripId: trip.id, distanceMeters: 5 });
const hasVehicle = text => {
  assert.match(text, /Toyota Yaris.*Couleur :\s+rouge.*PLAQUE.*1234AB01/);
  assert.equal(text.split('1234AB01').length, 2, 'one visible plate per modal');
  assert.match(text, /Vérifiez la plaque avant de monter/);
};
const makeLoader = (hooks, platform) => loader({ ...uiMocks, react: { ...React, ...hooks.react },
  'react-native': { Platform: { OS: platform }, StyleSheet: { create: value => value } },
  'react-native-maps': { PROVIDER_GOOGLE: 'google' },
  '@/utils/routeHelpers': { calculateDistance: () => 0 },
  '@/assets/images/map-markers/trip-detail-marker-departure.png': 1,
  '@/assets/images/map-markers/trip-detail-marker-arrival.png': 2,
  '@/assets/images/map-markers/trip-detail-marker-passenger.png': 3,
});

test('Home reminds passengers of the vehicle at both pickup stages without changing driver messages', () => {
  const { getHomeTrackingDialog } = loader(uiMocks)('features/home/homeTrackingDialogs.ts');
  for (const type of types) {
    const passenger = getHomeTrackingDialog(event(type), booking, false);
    assert.ok(passenger.message.length < 110);
    assert.doesNotMatch(passenger.message, /Toyota|Couleur|Plaque|non renseign/);
    hasVehicle(vehicleText(passenger.content.props.trip));
    const driver = getHomeTrackingDialog(event(type), booking, true);
    assert.match(driver.message, /Titulaire/);
    assert.doesNotMatch(driver.message, /Véhicule :|Plaque :/);
  }
  assert.doesNotMatch(getHomeTrackingDialog(event('pickup_confirmed'), booking, false).message, /Plaque :/);
});

for (const platform of ['ios', 'android']) {
  test(`${platform}: passenger navigation keeps the vehicle reminder at the pickup point and on driver arrival`, () => {
    const hooks = hookHarness();
    const { usePassengerNavigationPresentation } = makeLoader(hooks, platform)('hooks/passenger-navigation/usePassengerNavigationPresentation.ts');
    const props = { booking, trip, routeCoordinates: [], displayedDriverLocation: null, passengerLocation: null,
      pickupCoordinate: null, isPassengerOnboard: false, routeOriginCoordinate: null, activePassengerDestination: null,
      routeInfo: null, activeRouteSegment: 'route', setActiveRouteSegment() {} };
    for (const type of types) {
      const result = hooks.render(() => usePassengerNavigationPresentation({ ...props, pickupNotice: event(type) }));
      assert.ok(result.pickupNoticeText.length < 110);
      assert.doesNotMatch(result.pickupNoticeText, /Plaque|Couleur/);
      hasVehicle(vehicleText(trip));
      assert.equal(result.pickupNoticeTitle, type === 'parties_nearby' ? 'Vous êtes au point' : 'Le conducteur est là');
    }
    hooks.unmount();
  });

  test(`${platform}: trip detail adds the assigned vehicle only for the passenger and preserves deduplication`, () => {
    for (const isTripDriver of [false, true]) {
      const hooks = hookHarness(), shown = [];
      const { useTripDetailProgressNotices } = makeLoader(hooks, platform)('hooks/trip-detail/useTripDetailProgressNotices.ts');
      const props = { tripBookings: [booking], myBookings: [booking], trip,
        user: { id: isTripDriver ? 'driver' : 'holder' }, isTripDriver, activeBooking: isTripDriver ? null : booking,
        bookingForTrip: isTripDriver ? null : booking, showDialog: value => shown.push(value),
        presentedTripDetailAutoProgressKeysRef: { current: new Set() }, highestTripDetailAutoProgressPriorityRef: { current: new Map() } };
      const actions = hooks.render(() => useTripDetailProgressNotices(props));
      for (const type of types) {
        actions.presentTripDetailAutoProgressEvent(event(type));
        actions.presentTripDetailAutoProgressEvent(event(type));
      }
      assert.equal(shown.length, 2, 'one reminder per stage for the reservation, not per reserved seat');
      for (const dialog of shown) {
        if (isTripDriver) assert.doesNotMatch(dialog.message, /Véhicule :|Plaque :/);
        else hasVehicle(vehicleText(dialog.content.props.trip));
      }
      if (!isTripDriver) {
        actions.presentTripDetailAutoProgressEvent({ ...event('parties_nearby'), bookingId: 'other' });
        assert.equal(shown.length, 2, 'another booking cannot open this passenger modal');
      }
      hooks.unmount();
    }
  });
}

test('missing pickup vehicle data stays explicit and never falls back to a driver default vehicle', () => {
  const { getHomeTrackingDialog } = loader(uiMocks)('features/home/homeTrackingDialogs.ts');
  for (const type of types) {
    const dialog = getHomeTrackingDialog(event(type), { ...booking, trip: {
      id: trip.id, vehicleInfo: 'Informations véhicule fournies par le conducteur',
      description: 'Bagages limités', driver: { vehicle: { ...vehicle, brand: 'Unrelated' } },
    } }, false);
    const text = vehicleText(dialog.content.props.trip);
    assert.match(text, /Demandez au conducteur de confirmer son véhicule et sa plaque/);
    assert.doesNotMatch(text, /Unrelated|Toyota|undefined|null|non renseign|Bagages|Informations véhicule/);
  }
});

test('Home uses the already loaded trip when the nested booking only contains the mapper placeholder', () => {
  const { getHomeTrackingDialog } = loader(uiMocks)('features/home/homeTrackingDialogs.ts');
  const incomplete = { ...booking, trip: { id: trip.id, vehicleId: vehicle.id,
    vehicleInfo: 'Informations véhicule fournies par le conducteur' } };
  for (const type of ['driver_near_pickup', ...types]) {
    const dialog = getHomeTrackingDialog(event(type), incomplete, false, trip);
    hasVehicle(vehicleText(dialog.content.props.trip));
    assert.doesNotMatch(dialog.message, /Informations véhicule/);
  }
});

test('pickup vehicle resolution never borrows another ride or an old replaced vehicle', () => {
  const { resolvePickupVehicleTrip } = loader()('features/navigation/pickupAwareness.ts');
  assert.equal(resolvePickupVehicleTrip(trip.id, { ...trip, id: 'other' }, trip), trip);
  assert.equal(resolvePickupVehicleTrip(trip.id, { ...trip, id: 'other' }), undefined);
  const replaced = { id: trip.id, vehicleId: 'new-vehicle' };
  assert.equal(resolvePickupVehicleTrip(trip.id, replaced, trip), replaced);
  const removed = { id: trip.id, vehicleId: null };
  assert.equal(resolvePickupVehicleTrip(trip.id, removed, trip), removed);
  assert.deepEqual(resolvePickupVehicleTrip(trip.id, { id: trip.id, vehicleId: vehicle.id }, trip), {
    id: trip.id, vehicleId: vehicle.id, vehicle,
  });
});

test('the plate remains readable and the vehicle block adds no animation or action', () => {
  const collect = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(collect)
    : [node, ...collect(node.props?.children)];
  const content = collect(PickupVehicleDetails({ trip }));
  const plate = content.find(node => node.props.accessibilityLabel?.startsWith('Plaque d’immatriculation'));
  assert.equal(plate.props.children, vehicle.licensePlate);
  assert.equal(plate.props.numberOfLines, undefined);
  assert.equal(plate.props.style.flexShrink, 1);
  assert.equal(content.some(node => node.props.onPress || node.props.entering || node.props.source || node.props.visible), false);
  assert.equal(content.filter(node => node.type === 'Icon').length, 1);
  assert.match(vehicleText({ ...trip, vehicle: { ...vehicle, licensePlate: '' } }), /Confirmez la plaque/);
});
