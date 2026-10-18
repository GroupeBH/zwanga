const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { 'react-native': { StyleSheet: { create: value => value } } };
const load = loader(native);
const { rankDriverUpcomingTrips: rank, getDriverTripReservationCounts: counts } = load('features/home/homeDriverTripPriority.ts');
const { homePriorityKeys: keys } = load('features/home/homePriorityDismissal.ts');
const now = Date.now();
const trip = (id, hours = 1, statuses = [], extra = {}) => ({
  id, driverId: 'driver', status: 'upcoming', departureTime: new Date(now + hours * 3600000).toISOString(),
  availableSeats: 2, totalSeats: 4,
  passengers: statuses.map((status, i) => ({ bookingId: `${id}-${i}`, bookingStatus: status })), ...extra,
});
const ids = trips => trips.map(value => value.id);

test('unstarted trips with confirmed reservations outrank an empty imminent departure beyond three hours', () => {
  const reserved = Object.freeze(trip('reserved', 48, ['accepted']));
  const empty = Object.freeze(trip('empty', 0.5));
  const source = Object.freeze([empty, reserved]);
  assert.deepEqual(ids(rank(source, 'driver', {}, now)), ['reserved', 'empty']);
  assert.deepEqual(ids(source), ['empty', 'reserved']);
  assert.equal(rank(source, 'driver', {}, now)[0], reserved);
});

test('pending actions come first, then accepted trips, with the earliest departure in each group', () => {
  const trips = [trip('many-later', 24, ['accepted', 'accepted', 'accepted']), trip('one-earlier', 10, ['accepted']),
    trip('mixed-pending-later', 30, ['pending', 'accepted']), trip('pending-earlier', 20, ['pending']), trip('empty', 0.5)];
  assert.deepEqual(ids(rank(trips, 'driver', {}, now)),
    ['pending-earlier', 'mixed-pending-later', 'one-earlier', 'many-later', 'empty']);
  assert.deepEqual(ids(rank([trip('b', 8, ['accepted']), trip('a', 8, ['accepted'])], 'driver', {}, now)), ['a', 'b']);
});

test('cancelled/rejected/completed/no-show or unknown bookings never create reservation priority', () => {
  const inactive = trip('inactive', 24, ['cancelled', 'rejected', 'completed', 'no_show', undefined]);
  assert.equal(counts(inactive).total, 0);
  assert.deepEqual(rank([inactive, trip('empty-future', 4)], 'driver', {}, now), []);
  assert.equal(counts(trip('mixed', 1, ['pending', 'accepted', 'cancelled'])).total, 2);
  // Occupied seats alone are not proof of a reservation.
  assert.deepEqual(rank([trip('full', 24, [], { availableSeats: 0 })], 'driver', {}, now), []);
});

test('a booked departure that is late remains visible only while the server says unstarted/upcoming', () => {
  const late = trip('late', -1, ['accepted']);
  const excluded = [trip('past-empty', -1), trip('bad-date', 1, ['accepted'], { departureTime: 'invalid' }),
    ...['ongoing', 'completed', 'cancelled'].map(status => trip(status, 1, ['accepted'], { status })),
    trip('already-started', 1, ['accepted'], { startedAt: new Date(now).toISOString() }),
    trip('other-owner', 1, ['accepted'], { driverId: 'other' }),
    trip('conflicting-owner', 1, ['accepted'], { driver: { id: 'other' } })];
  assert.deepEqual(ids(rank([...excluded, late], 'driver', {}, now)), ['late']);
  assert.deepEqual(rank([late], undefined, {}, now), []);
  assert.deepEqual(ids(rank([trip('boundary', 3), trip('outside', 3.001)], 'driver', {}, now)), ['boundary']);
});

test('server booking summary survives missing passenger identities and takes precedence over stale passenger arrays', () => {
  const summaryTrip = trip('summary', 24, [], { reservationSummary: { pendingBookingIds: ['new'], acceptedCount: 2 } });
  assert.deepEqual(counts(summaryTrip), { pending: 1, accepted: 2, total: 3 });
  assert.deepEqual(counts(summaryTrip, { 'booking:new': true }), { pending: 0, accepted: 2, total: 2 });
  assert.equal(rank([summaryTrip], 'driver', {}, now)[0], summaryTrip);
  const cancelled = { ...summaryTrip, passengers: [{ bookingStatus: 'accepted' }],
    reservationSummary: { pendingBookingIds: [], acceptedCount: 0 } };
  assert.deepEqual(rank([cancelled], 'driver', {}, now), []);
});

function fixture(initialTrips) {
  const hooks = hookHarness(), queries = [], empty = [];
  const state = { trips: initialTrips, bookings: {}, passengerBookings: empty };
  const props = { isDriver: true, isFocused: true, currentUser: { id: 'driver' }, hiddenHomePriorities: {} };
  const { useHomeDriverActivity } = loader({ ...native, react: hooks.react,
    '@/store/hooks': { useAppSelector: selector => selector({ zwangaApi: { config: { online: true } } }) },
    '@/store/api/tripApi': { useGetMyActivityTripsQuery: () => ({ data: state.trips }), useGetTripByIdQuery: () => ({}) },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({ data: state.passengerBookings }),
      useGetTripBookingsQuery: (id, options) => { queries.push({ id, options }); return { data: state.bookings[id] ?? empty }; } },
  })('hooks/home/useHomeDriverActivity.ts');
  const { useHomeTripSelection } = loader({ ...native, react: hooks.react })('hooks/home/useHomeTripSelection.ts');
  const selection = { remoteTrips: [trip('public', 1, [], { driverId: 'other' })], storedTrips: empty,
    completedBookingTripIds: new Set(), bookedTripIds: new Set() };
  return { props, state, queries, hooks, render: () => hooks.render(() => {
    const activity = useHomeDriverActivity(props);
    return { ...activity, ...useHomeTripSelection({ ...selection, ...props, ...activity, activeBookings: state.passengerBookings }) };
  }) };
}

test('accepting a reservation keeps its trip highlighted without adding a query for every published trip', () => {
  const empty = trip('empty', 1), reserved = trip('reserved', 24, ['pending']);
  const app = fixture([empty, reserved]);
  app.state.bookings.reserved = [{ id: 'reserved-0', tripId: 'reserved', status: 'pending' }];
  const pending = app.render();
  assert.equal(pending.featuredDriverReservation.trip, reserved);
  assert.deepEqual(app.queries.filter(query => !query.options.skip).map(query => query.id), ['reserved']);
  const accepted = { ...reserved, passengers: [{ bookingId: 'reserved-0', bookingStatus: 'accepted' }] };
  app.state.trips = [empty, accepted];
  app.state.bookings.reserved = [{ id: 'reserved-0', tripId: 'reserved', status: 'accepted' }];
  app.queries.length = 0;
  const confirmed = app.render();
  assert.equal(confirmed.featuredDriverReservation, null);
  assert.equal(confirmed.featuredDriverUpcomingTrip, accepted);
  assert.equal(confirmed.latestTrips, pending.latestTrips, 'public map/feed references stay unchanged');
  assert.equal(confirmed.isHomeSheetLockedRetracted, false);
  assert.deepEqual(app.queries.filter(query => !query.options.skip).map(query => query.id), ['reserved']);
  app.props.isFocused = false; app.queries.length = 0; app.render();
  assert.ok(app.queries.every(query => query.options.skip));
  app.hooks.unmount();
});

test('hiding a reserved trip selects the next, while a new pending booking remains actionable', () => {
  const first = trip('first', 12, ['accepted']), second = trip('second', 24, ['accepted']);
  const app = fixture([second, first]);
  assert.equal(app.render().featuredDriverUpcomingTrip, first);
  app.props.hiddenHomePriorities = { [keys.upcomingTrip(first)]: true };
  assert.equal(app.render().featuredDriverUpcomingTrip, second);
  const pending = { ...first, passengers: [...first.passengers, { bookingId: 'new', bookingStatus: 'pending' }] };
  app.state.trips = [second, pending];
  app.state.bookings.first = [{ id: 'new', tripId: 'first', status: 'pending' }];
  assert.equal(app.render().featuredDriverReservation.booking.id, 'new');
  app.hooks.unmount();
});

test('a dismissed pending booking cannot prevent another trip pending action from being highlighted', () => {
  const mixed = trip('mixed', 12, ['pending', 'accepted']), pending = trip('pending', 24, ['pending']);
  const app = fixture([mixed, pending]);
  app.props.hiddenHomePriorities = { 'booking:mixed-0': true };
  app.state.bookings.pending = [{ id: 'pending-0', tripId: 'pending', status: 'pending' }];
  assert.equal(app.render().featuredDriverReservation.trip, pending);
  app.hooks.unmount();
});

test('starting, cancelling or completing a trip removes its upcoming priority and preserves active ride precedence', () => {
  for (const status of ['ongoing', 'completed', 'cancelled']) {
    const first = trip('first', 12, ['accepted']), second = trip('second', 24, ['accepted']);
    const app = fixture([first, second]);
    assert.equal(app.render().featuredDriverUpcomingTrip, first);
    app.state.trips = [{ ...first, status }, second];
    const next = app.render();
    assert.equal(next.featuredDriverUpcomingTrip, status === 'ongoing' ? null : second);
    assert.equal(next.activeHomeTrip?.id ?? null, status === 'ongoing' ? 'first' : null);
    app.hooks.unmount();
  }
  const app = fixture([trip('driver-trip', 12, ['accepted'])]);
  const passengerTrip = trip('passenger-trip', -1, [], { status: 'ongoing', driverId: 'other' });
  app.state.passengerBookings = [{ id: 'mine', passengerId: 'driver', tripId: passengerTrip.id, trip: passengerTrip, status: 'accepted' }];
  assert.equal(app.render().activeHomeTrip, passengerTrip);
  assert.equal(app.render().featuredDriverUpcomingTrip, null);
  app.hooks.unmount();
});

test('cancelling the final booking returns to the next imminent published trip', () => {
  const reserved = trip('reserved', 24, ['accepted']), empty = trip('empty', 1);
  const app = fixture([reserved, empty]);
  assert.equal(app.render().featuredDriverUpcomingTrip, reserved);
  app.state.trips = [{ ...reserved, passengers: [{ bookingStatus: 'cancelled' }] }, empty];
  assert.equal(app.render().featuredDriverUpcomingTrip, empty);
  app.hooks.unmount();
});

test('booking status responses refresh the authenticated driver trip summary as well as booking details', () => {
  const { buildCreateBookingEndpoints } = load('store/api/booking/createBooking.endpoints.ts');
  const endpoints = buildCreateBookingEndpoints({ query: value => value, mutation: value => value });
  const { myTripsListTag, bookingListTag, tripListTag } = load('store/api/booking/cachePolicy.ts');
  for (const status of ['accepted', 'rejected', 'cancelled']) {
    const tags = endpoints.updateBookingStatus.invalidatesTags({ id: 'booking', tripId: 'trip', status });
    for (const expected of [myTripsListTag, bookingListTag, tripListTag,
      { type: 'Booking', id: 'booking' }, { type: 'Trip', id: 'trip' }]) {
      assert.ok(tags.some(tag => tag.type === expected.type && tag.id === expected.id));
    }
  }
  assert.ok(endpoints.updateBookingStatus.invalidatesTags(undefined).includes(myTripsListTag));
});
