const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const trip = { id: 'active', status: 'ongoing', driverId: 'owner',
  departureTime: '2026-01-01T10:00:00Z', departure: { lat: -4.3, lng: 15.3 } };
const booking = { id: 'mine', passengerId: 'rider', tripId: 'active', status: 'accepted', trip, numberOfSeats: 3 };
const endings = [{ status: 'completed' }, { droppedOff: true }, { droppedOffConfirmedByPassenger: true },
  { droppedOffAt: '2026-09-25T12:00:00Z' }, { droppedOffConfirmedAt: '2026-09-25T12:00:00Z' }];
const policy = loader()('features/activity/tripParticipation.ts');

test('every acknowledged dropoff form ends passenger participation even with an unpaid electronic bill', () => {
  for (const end of endings) {
    const finished = { ...booking, ...end, paymentMode: 'electronic', paymentStatus: 'pending' };
    assert.equal(policy.hasPassengerFinishedRide(finished), true);
    assert.equal(policy.selectOngoingParticipation('rider', [trip], [finished]), null);
    const otherRide = { ...booking, id: 'next' };
    assert.equal(policy.selectOngoingParticipation('rider', [trip], [finished, otherRide]).bookingId, 'next');
    assert.equal(policy.selectOngoingParticipation('owner', [trip], [finished]).role, 'driver');
  }
  for (const status of ['completed', 'cancelled']) {
    assert.equal(policy.isActivePassengerBooking({ ...booking, trip: { ...trip, status } }, 'rider'), false);
  }
});

test('Home immediately unlocks after dropoff, independent of stale tracking and completed trip cache', () => {
  const hooks = hookHarness();
  const { useHomeTripSelection } = loader({ react: hooks.react,
    'react-native': { StyleSheet: { create: s => s } },
  })('hooks/home/useHomeTripSelection.ts');
  const nearby = { ...trip, id: 'nearby', status: 'upcoming', departureTime: new Date(Date.now() + 3600000).toISOString() };
  const props = { currentUser: { id: 'rider' }, remoteTrips: [nearby], storedTrips: [],
    activeBookings: [booking], completedBookingTripIds: new Set(), bookedTripIds: new Set(['active']),
    trackedTripInfo: { role: 'driver', tripId: 'active' }, ongoingDriverTrip: null, isDriver: true,
    driverReservationHighlightTrip: null, driverReservationHighlightBookings: [], myDriverTrips: [],
  };
  const render = () => hooks.render(() => useHomeTripSelection(props));
  assert.equal(render().activeHomeTrip, trip, 'real ongoing booking survives old departure dates and suggestion ranking');
  assert.equal(render().isHomeSheetLockedRetracted, true);
  props.activeBookings = [{ ...booking, trip: undefined }];
  props.remoteTrips = [nearby, trip];
  props.refreshedPassengerTrip = { ...trip, id: 'previous-lookup' };
  assert.equal(render().activeHomeTrip, trip, 'a partial booking can use the matching feed while its detail loads');
  props.remoteTrips = [nearby];
  for (const end of endings) {
    props.activeBookings = [{ ...booking, ...end }];
    props.completedBookingTripIds = new Set(['active']);
    props.refreshedPassengerTrip = trip;
    const result = render();
    assert.equal(result.isHomeSheetLockedRetracted, false);
    assert.equal(result.ongoingBookedTrip, null);
    assert.deepEqual(result.homeMapTrips.map(t => t.id), ['nearby']);
  }
  hooks.unmount();
});

test('passenger activity removes completed transport but preserves another reservation and unpaid data', () => {
  const hooks = hookHarness();
  let rows = [booking];
  const queries = [];
  const { useHomePassengerActivity } = loader({ react: hooks.react,
    'react-native': { StyleSheet: { create: s => s } },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({ data: rows }) },
    '@/store/api/tripApi': { useGetTripByIdQuery: (id, options) => { queries.push({ id, ...options }); return {}; } },
    '@/store/api/notificationApi': { useGetNotificationsQuery: () => ({}) },
    '@/store/api/tripRequestApi': { useGetAvailableTripRequestsQuery: () => ({}), useGetMyTripRequestsQuery: () => ({}) },
  })('hooks/home/useHomePassengerActivity.ts');
  const render = () => hooks.render(() => useHomePassengerActivity({ isFocused: true, currentUser: { id: 'rider' }, isDriver: true }));
  assert.equal(render().activePassengerBooking, booking);
  for (const end of endings) {
    rows = [{ ...booking, ...end, paymentMode: 'electronic', paymentStatus: 'pending' }];
    const result = render();
    assert.deepEqual(result.activeBookings, []);
    assert.equal(result.activePassengerBooking, null);
    assert.equal(result.completedBookingTripIds.has('active'), true);
    assert.equal(queries.at(-1).skip, true);
    assert.equal(rows[0].paymentStatus, 'pending');
  }
  rows = [...rows, { ...booking, id: 'second' }];
  assert.equal(render().activePassengerBooking.id, 'second');
  assert.equal(render().completedBookingTripIds.has('active'), false, 'a separate active booking is not hidden');
  hooks.unmount();
});

test('Home releases navigation GPS when participation ends, regardless of the old notification role', () => {
  const hooks = hookHarness(), calls = [];
  const { useHomeLocation } = loader({ react: hooks.react,
    '@/hooks/useUserLocation': { useUserLocation: options => { calls.push(options); return {}; } },
  })('hooks/home/useHomeLocation.ts');
  const props = { isFocused: true, ongoingDriverTrip: null, ongoingPassengerBooking: booking,
    trackedTripInfo: { role: 'driver', tripId: 'active', bookingId: 'mine' } };
  hooks.render(() => useHomeLocation(props));
  assert.equal(calls.at(-1).rideLocationKey, 'passenger:mine');
  props.ongoingPassengerBooking = null;
  hooks.render(() => useHomeLocation(props));
  assert.equal(calls.at(-1).rideLocationKey, null);
  assert.equal(calls.at(-1).trackingProfile, 'nearby');
  hooks.unmount();
});
