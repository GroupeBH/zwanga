const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('navigation focuses the chosen pending booking without overriding an in-flight response or an accepted booking', () => {
  const hooks = hookHarness();
  const { useDriverNavigationBookings } = loader({ react: hooks.react, 'expo-location': {},
    'react-native': { Platform: { OS: 'android' }, StyleSheet: { create: value => value } },
  })('hooks/driver-navigation/useDriverNavigationBookings.ts');
  const first = { id: 'first', tripId: 'trip', status: 'pending', numberOfSeats: 1 };
  const chosen = { ...first, id: 'chosen' };
  const props = { bookings: [first, chosen], trip: { id: 'trip', status: 'ongoing' }, focusBookingId: chosen.id,
    locallyAcceptedBookingIds: new Set(), locallyCancelledBookingIds: new Set(), locallyPickedUpBookingIds: new Set(),
    livePassengerLocations: {}, processingBookingId: null, skippedPickupBookingIdsRef: { current: new Set() } };
  const render = () => hooks.render(() => useDriverNavigationBookings(props));
  assert.equal(render().activePendingBooking.id, chosen.id);
  assert.equal(render().pendingBookingQueueCount, 1);
  props.processingBookingId = first.id;
  assert.equal(render().activePendingBooking.id, first.id);
  props.processingBookingId = null; props.bookings = [first, { ...chosen, status: 'accepted' }];
  assert.equal(render().activePendingBooking.id, first.id);
  props.focusBookingId = 'foreign-booking'; assert.equal(render().activePendingBooking.id, first.id);
  hooks.unmount();
});
