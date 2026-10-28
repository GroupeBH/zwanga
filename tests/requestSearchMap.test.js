const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { showRequestSearchMap, requestSearchPhase, searchVehicles, searchVehicleAppearance, searchPassengerPosition, assignedPassengerNavigation } =
  loader()('features/request-detail/requestSearchModel.ts');
const now = Date.parse('2026-10-28T12:00:00Z');
const request = { id: 'request', passengerId: 'owner', status: 'pending', departureDateMax: new Date(now + 600000).toISOString() };

test('a passenger or driver ordering as passenger sees the search map only for their open request', () => {
  assert.equal(showRequestSearchMap(request, 'owner', now), true);
  assert.equal(showRequestSearchMap({ ...request, status: 'offers_received' }, 'owner', now), true);
  for (const user of [undefined, 'driver', 'another']) assert.equal(showRequestSearchMap(request, user, now), false);
  for (const patch of [{ status: 'expired' }, { status: 'cancelled' }, { status: 'driver_selected' }, { selectedDriverId: 'driver' },
    { tripId: 'trip' }, { departureDateMax: new Date(now - 4 * 3600000).toISOString() }])
    assert.equal(showRequestSearchMap({ ...request, ...patch }, 'owner', now), false);
});

const vehicle = { id: 'opaque-marker', latitude: -4.3011, longitude: 15.3011, vehicleType: 'car', positionUpdatedAt: new Date(now).toISOString() };
const marker = { ...vehicle, ageMs: 0 };
const snapshot = { requestId: 'request', searching: true, generatedAt: new Date(now).toISOString(), vehicles: [vehicle], total: 1 };

test('search stops at latest departure, but its editable grace period stays intact', () => {
  const overdue = { ...request, departureDateMax: new Date(now).toISOString() };
  assert.equal(showRequestSearchMap(overdue, 'owner', now), true);
  assert.equal(requestSearchPhase(overdue, snapshot, now, now), 'past-departure');
  assert.equal(requestSearchPhase(request, snapshot, now, now), 'searching');
  assert.equal(requestSearchPhase(request, { ...snapshot, searching: false }, now, now), 'inactive');
  assert.equal(requestSearchPhase(request, { ...snapshot, requestId: 'other', searching: false }, now, now), 'searching');
  assert.equal(requestSearchPhase(request, snapshot, now + 3600000, now + 3600000), 'searching', 'server time resists phone clock skew');
  assert.equal(requestSearchPhase(overdue, snapshot, now + 1000, now), 'past-departure', 'legacy searching=true does not extend dispatch');
});
test('no invented vehicles: only valid current request snapshots are rendered', () => {
  assert.deepEqual(searchVehicles(snapshot, 'request', now), [marker]);
  for (const patch of [{ requestId: 'other' }, { searching: false }, { generatedAt: 'invalid' },
    { generatedAt: new Date(now - 91000).toISOString() }, { generatedAt: new Date(now + 61000).toISOString() }])
    assert.deepEqual(searchVehicles({ ...snapshot, ...patch }, 'request', now), []);
  assert.deepEqual(searchVehicles(undefined, 'request', now), []);
  assert.deepEqual(searchVehicles({ ...snapshot, vehicles: [null, vehicle, vehicle, { ...vehicle, id: 'bad', latitude: NaN },
    { ...vehicle, id: '' }, { ...vehicle, id: 'unknown', vehicleType: 'plane' },
    { ...vehicle, id: 'bad-date', positionUpdatedAt: 'invalid' }, { ...vehicle, id: 'missing-date', positionUpdatedAt: null },
    { ...vehicle, id: 'future', positionUpdatedAt: new Date(now + 61000).toISOString() }] }, 'request', now), [marker]);
});

test('each vehicle keeps its recorded position, even if several are in the same former grid cell', () => {
  const second = { ...vehicle, id: 'second', latitude: -4.3012, longitude: 15.3012, vehicleType: 'motorcycle_2_wheels' };
  assert.deepEqual(searchVehicles({ ...snapshot, vehicles: [vehicle, second] }, 'request', now), [marker, { ...second, ageMs: 0 }]);
  assert.deepEqual(searchVehicles({ ...snapshot, vehicles: undefined, groups: [{ latitude: -4.3, longitude: 15.3, count: 10 }] }, 'request', now), []);
});

test('rendering is bounded, even if an unexpected server response contains too many markers', () => {
  const vehicles = Array.from({ length: 1000 }, (_, i) => ({ ...vehicle, id: `vehicle-${i}` }));
  assert.equal(searchVehicles({ ...snapshot, vehicles }, 'request', now).length, 500);
});

test('map freshness uses the local receipt time even when the phone clock differs from the server', () => {
  assert.deepEqual(searchVehicles({ ...snapshot, generatedAt: new Date(now + 3600000).toISOString() }, 'request', now, now), [{ ...marker, ageMs: 3600000 }]);
  assert.deepEqual(searchVehicles(snapshot, 'request', now, now - 91000), []);
  assert.deepEqual(searchVehicles({ ...snapshot, vehicles: [{ ...vehicle, latitude: '15.3011', longitude: '-4.3011' }] }, 'request', now), [marker]);
});

test('old positions remain explicit last-known positions; their age advances from local receipt time', () => {
  const old = { ...vehicle, positionUpdatedAt: new Date(now - 8 * 3600000).toISOString() };
  const [point] = searchVehicles({ ...snapshot, vehicles: [old] }, 'request', now + 30000, now);
  assert.equal(point.ageMs, 8 * 3600000 + 30000);
  assert.match(searchVehicleAppearance(point).description, /il y a 8 h · position ancienne/);
  assert.equal(searchVehicleAppearance(point).opacity, 0.55);
  assert.equal(searchVehicleAppearance({ ...marker, ageMs: 599999 }).opacity, 1);
  assert.equal(searchVehicleAppearance({ ...marker, ageMs: 600000 }).opacity, 0.55);
  assert.match(searchVehicleAppearance(marker).description, /moins d’une minute/);
  assert.match(searchVehicleAppearance({ ...marker, ageMs: 3 * 86400000 }).description, /3 j/);
  for (const [type, title, imageType] of [['car', 'Voiture', 'car'], ['motorcycle_2_wheels', 'Moto', 'moto'], ['motorcycle_3_wheels', 'Tricycle', 'tricycle']]) {
    const appearance = searchVehicleAppearance({ ...marker, vehicleType: type });
    assert.equal(appearance.title, title);
    assert.equal(appearance.imageType, imageType);
  }
});

test('the pulsating passenger dot never labels an old GPS measurement as the current position', () => {
  const location = { coords: { latitude: -4.3, longitude: 15.3 }, timestamp: now };
  assert.deepEqual(searchPassengerPosition(location, now), location.coords);
  for (const value of [null, { ...location, timestamp: now - 121000 }, { ...location, timestamp: NaN },
    { ...location, timestamp: now + 61000 }, { ...location, coords: { latitude: null, longitude: null } }])
    assert.equal(searchPassengerPosition(value, now), null);
});

test('navigation needs the owner’s confirmed live booking, not just a driver offer', () => {
  const assigned = { ...request, status: 'driver_selected', tripId: 'trip' };
  const trip = { id: 'trip', driverId: 'driver', status: 'upcoming' };
  const booking = { id: 'booking', tripId: 'trip', passengerId: 'owner', status: 'accepted' };
  assert.equal(assignedPassengerNavigation(assigned, trip, [booking], 'owner'), '/booking/navigate/booking');
  assert.equal(assignedPassengerNavigation(request, trip, [booking], 'owner'), null);
  for (const patch of [{ passengerId: 'other' }, { tripId: 'other' }, { status: 'pending' }, { status: 'cancelled' },
    { droppedOff: true }, { droppedOffConfirmedByPassenger: true }, { cancelledAt: 'date' }])
    assert.equal(assignedPassengerNavigation(assigned, trip, [{ ...booking, ...patch }], 'owner'), null);
  for (const patch of [{ status: 'completed' }, { status: 'cancelled' }, { driverId: 'owner' }])
    assert.equal(assignedPassengerNavigation(assigned, { ...trip, ...patch }, [booking], 'owner'), null);
  assert.equal(assignedPassengerNavigation(assigned, trip, [booking], 'other'), null);
});
