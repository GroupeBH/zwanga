const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { selectRideTracking } = loader()('features/activity/rideTrackingSelection.ts');
const own = { id: 'own', driverId: 'me', status: 'ongoing' };
const booking = (extra = {}) => ({ id: 'booking', passengerId: 'me', tripId: 'other', status: 'accepted', numberOfSeats: 3,
  trip: { id: 'other', driverId: 'other-user', status: 'ongoing' }, ...extra });

test('live passenger reservation wins over an older ongoing driver trip, including multi-seat bookings', () => {
  const selected = selectRideTracking('me', [own], [booking()]);
  assert.equal(selected.driver, null); assert.equal(selected.passenger.id, 'booking');
});
for (const progress of [{ droppedOff: true }, { droppedOffAt: '2026-09-25' }, { droppedOffConfirmedAt: '2026-09-25' }, { status: 'completed' }]) {
  test(`finished transport stops tracking independently of payment: ${JSON.stringify(progress)}`, () => {
    assert.equal(selectRideTracking('me', [], [booking({ ...progress, paymentStatus: 'pending' })], 'booking').passenger, null);
  });
}
test('pending prearm does not override a live driver trip; it works without a live driver trip', () => {
  const upcoming = booking({ status: 'pending', trip: { id: 'other', status: 'pending', departureTime: new Date().toISOString() } });
  assert.equal(selectRideTracking('me', [own], [upcoming], upcoming.id).passenger, null);
  assert.equal(selectRideTracking('me', [], [upcoming], upcoming.id).passenger.id, upcoming.id);
});
test('foreign accounts, own trip bookings and completed trips never arm passenger tracking', () => {
  for (const invalid of [booking({ passengerId: 'foreign' }), booking({ tripId: 'own', trip: own }), booking({ trip: { id: 'other', status: 'completed' } })]) {
    assert.equal(selectRideTracking('me', [], [invalid], invalid.id).passenger, null);
  }
  assert.equal(selectRideTracking('foreign', [own], []).driver, null);
});
test('another reservation remains tracked after one reservation is dropped off', () => {
  const active = booking({ id: 'second' });
  assert.equal(selectRideTracking('me', [], [booking({ droppedOff: true }), active]).passenger.id, 'second');
});
test('no_show tracking remains eligible while its trip is actually ongoing', () => {
  const selected = selectRideTracking('me', [own], [booking({ status: 'no_show' })]);
  assert.equal(selected.driver, null); assert.equal(selected.passenger.id, 'booking');
});
