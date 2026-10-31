const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { canChangeRequestDriver, mapDriverSelectionPayload } = loader()('features/request-detail/requestDriverChangePolicy.ts');
const request = { id: 'request', passengerId: 'owner', status: 'driver_selected', selectedDriverId: 'driver',
  tripId: 'trip', selectedAt: '2026-10-30T12:00:00.000Z', updatedAt: '2026-10-30T12:00:00.000Z' };
const booking = { passengerId: 'owner', tripId: 'trip', status: 'accepted' };

test('only the owner can change a selected, unboarded, unpaid request driver', () => {
  assert.equal(canChangeRequestDriver(request, 'owner', booking), true);
  assert.equal(canChangeRequestDriver(request, 'owner'), true);
  for (const user of [undefined, 'driver', 'other']) assert.equal(canChangeRequestDriver(request, user, booking), false);
  for (const patch of [{ status: 'cancelled' }, { status: 'pending' }, { selectedDriverId: null }, { selectedAt: null }])
    assert.equal(canChangeRequestDriver({ ...request, ...patch }, 'owner', booking), false);
  for (const patch of [{ passengerId: 'other' }, { tripId: 'other' }, { status: 'completed' },
    { pickedUp: true }, { pickedUpAt: 'date' }, { pickedUpConfirmedByPassenger: true }, { pickedUpConfirmedAt: 'date' },
    { droppedOff: true }, { droppedOffAt: 'date' }, { droppedOffConfirmedByPassenger: true },
    { paidAt: 'date' }, { paymentTransactionId: 'tx' }, { paymentReference: 'ref' }, { cashReceivedAt: 'date' },
    { cashReceivedAmount: '100' }, { mixedPaymentAt: 'date' }, { mixedTokenQuantity: 10 },
    { paymentStatus: 'initiated' }, { paymentStatus: 'succeeded' }])
    assert.equal(canChangeRequestDriver(request, 'owner', { ...booking, ...patch }), false, JSON.stringify(patch));
});

test('map selection carries the displayed request revision and an opaque marker, never a driver ID', () => {
  const open = { ...request, status: 'pending', selectedDriverId: null, tripId: null };
  const marker = 'a'.repeat(64);
  assert.deepEqual(mapDriverSelectionPayload(open, marker), { id: 'request', markerId: marker, expectedUpdatedAt: open.updatedAt });
  for (const patch of [{ status: 'cancelled' }, { status: 'driver_selected' }, { selectedDriverId: 'driver' },
    { tripId: 'trip' }, { targetDriverPriorityUntil: 'deadline' }, { updatedAt: 'invalid' }])
    assert.equal(mapDriverSelectionPayload({ ...open, ...patch }, marker), null);
  for (const id of ['', 'driver', 'x'.repeat(64)]) assert.equal(mapDriverSelectionPayload(open, id), null);
});

test('native map taps use a separate compact action panel and memoization tracks the callback', () => {
  const map = readFileSync('features/request-detail/RequestSearchMap.tsx', 'utf8');
  assert.match(map, /if \(active\) onSelectVehicle\?\.\(vehicle.id\)/);
  assert.match(map, /a.onSelectVehicle === b.onSelectVehicle/);
  assert.match(map, /tracksViewChanges=\{false\}/);
  const screen = readFileSync('features/request-detail/RequestSearchScreen.tsx', 'utf8');
  assert.match(screen, /!request.targetDriverPriorityUntil/);
  assert.match(screen, /MapDriverSelection/);
  assert.match(screen, /maxHeight: '34%'/);
  const change = readFileSync('features/request-detail/ChangeRequestDriverButton.tsx', 'utf8');
  assert.match(change, /version !== getTokenSessionVersion/);
  assert.match(change, /current.request\?\.selectedAt !== selection.selectedAt/);
  assert.match(change, /await dispatch\(tripRequestApi.util.upsertQueryData/);
});
