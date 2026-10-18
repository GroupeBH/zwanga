const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { canShowRequestNotification, orderNotificationText } = loader()('features/notifications/requestVisibility.ts');
const { getNotificationHref } = loader()('utils/notificationNavigation.ts');

test('other users’ order alerts stay hidden for passengers, missing profiles and legacy driver flags', () => {
  for (const type of ['trip_request', 'new_trip_request', 'trip_request_nearby', 'driver_dispatch_offer']) {
    for (const user of [undefined, null, { id: 'user', role: 'passenger' }, { id: 'user', role: 'passenger', isDriver: true }]) {
      assert.equal(canShowRequestNotification({ type }, user), false);
    }
    assert.equal(canShowRequestNotification({ type }, { id: 'driver', role: 'driver' }), true);
    assert.equal(canShowRequestNotification({ type, driverId: 'other' }, { id: 'driver', role: 'driver' }), false);
    assert.equal(getNotificationHref({ type, requestId: 'order' }, { id: 'user', role: 'passenger' }), null);
  }
});

test('own command lifecycle notifications and published-trip bookings remain visible to passengers', () => {
  const user = { id: 'passenger', role: 'passenger' };
  for (const type of ['trip_request_accepted', 'trip_request_reopened', 'trip_request_expired', 'trip_request_driver_overdue', 'trip_started', 'booking_confirmed']) {
    assert.equal(canShowRequestNotification({ type, driverId: 'driver' }, user), true);
  }
  assert.equal(getNotificationHref({ type: 'trip_request_accepted', tripId: 'trip', requestId: 'order' }, user), '/trip/trip');
  assert.deepEqual(getNotificationHref({ type: 'trip_request_reopened', requestId: 'order' }, user), { pathname: '/request-details/[id]', params: { id: 'order' } });
});

test('old order notification text is updated without renaming payment, support or technical types', () => {
  const data = { type: 'trip_request_accepted' };
  assert.equal(orderNotificationText('Demande acceptée. Vos demandes sont visibles.', data), 'Commande acceptée. Vos commandes sont visibles.');
  assert.equal(data.type, 'trip_request_accepted');
  assert.equal(orderNotificationText('Demande de retrait', { type: 'wallet_withdrawal' }), 'Demande de retrait');
  assert.equal(orderNotificationText('Demande envoyée', null), 'Demande envoyée');
});
