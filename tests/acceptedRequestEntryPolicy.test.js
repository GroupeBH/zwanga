const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { isDepartureToday, isAcceptedRequestTrip, canResumeAcceptedRequest, selectAcceptedRequestTrip, acceptedRequestEntryKey } =
  loader()('features/navigation/acceptedRequestEntry.ts');
const now = Date.parse('2026-10-19T08:00:00Z');
const at = time => `2026-10-19T${time}:00Z`;
const trip = patch => ({ id: 'ride', driverId: 'driver', tripRequestId: 'order', status: 'upcoming', departureTime: at('10:00'), ...patch });
const request = patch => ({ id: 'order', passengerId: 'passenger', selectedDriverId: 'driver', tripId: 'ride',
  status: 'driver_selected', departureDateMin: at('10:00'), departureDateMax: at('11:00'), ...patch });
const publication = patch => trip({ id: 'published', tripRequestId: null, departureTime: at('09:00'), ...patch });
const resume = (others = [], requestPatch = {}, tripPatch = {}) =>
  canResumeAcceptedRequest(request(requestPatch), trip(tripPatch), 'driver', [trip(tripPatch), ...others], now);

test('accepted unstarted request today qualifies with no earlier published departure', () => {
  assert.equal(resume(), true);
  assert.equal(resume([publication()]), false);
  assert.equal(resume([publication({ departureTime: at('10:00') })]), true, 'equal is not earlier');
  assert.equal(resume([publication({ departureTime: at('10:30') })]), true);
});

test('publication cutoff is the passenger desired time, not an adjusted generated-trip time', () => {
  assert.equal(resume([publication({ departureTime: at('10:30') })], {}, { departureTime: at('11:00') }), true);
  assert.equal(resume([publication()], {}, { departureTime: at('11:00') }), false);
});

test('only the driver own live unstarted publications today block entry', () => {
  for (const patch of [{ status: 'cancelled' }, { status: 'completed' }, { isExpired: true },
    { driverId: 'other' }, { driver: { id: 'other' } }, { startedAt: at('08:00') }, { completedAt: at('08:00') },
    { tripRequestId: 'another-order' }, { departureTime: '2026-10-18T09:00:00Z' }, { departureTime: 'invalid' }]) {
    assert.equal(resume([publication(patch)]), true, JSON.stringify(patch));
  }
});

test('accepted entry rejects foreign, already started, finished, expired and other-day trips', () => {
  for (const patch of [{ driverId: 'other' }, { driver: { id: 'other' } }, { status: 'ongoing' },
    { status: 'completed' }, { status: 'cancelled' }, { startedAt: at('08:00') }, { completedAt: at('08:00') },
    { isExpired: true }, { tripRequestId: null }, { departureTime: '2026-10-20T09:00:00Z' },
    { departureTime: '2026-10-18T09:00:00Z' }, { departureTime: 'invalid' }]) {
    assert.equal(isAcceptedRequestTrip(trip(patch), 'driver', now), false, JSON.stringify(patch));
    assert.equal(resume([], {}, patch), false);
  }
});

test('fresh request must confirm the selected driver and both sides of the trip link', () => {
  for (const patch of [{ id: 'other' }, { tripId: 'other' }, { selectedDriverId: 'other' },
    { selectedDriverId: undefined }, { passengerId: 'driver' }, { status: 'pending' }, { status: 'offers_received' },
    { status: 'cancelled' }, { status: 'expired' }, { departureDateMin: '2026-10-20T09:00:00Z' },
    { departureDateMin: '2026-10-18T09:00:00Z' }, { departureDateMin: 'invalid' },
    { departureDateMax: '2026-10-19T06:00:00Z' }]) {
    assert.equal(resume([], patch), false, JSON.stringify(patch));
  }
});

test('today means the Kinshasa calendar day including the UTC midnight boundary', () => {
  const midnight = Date.parse('2026-10-18T23:05:00Z');
  assert.equal(isDepartureToday('2026-10-18T23:01:00Z', midnight), true);
  assert.equal(isDepartureToday('2026-10-19T22:59:59Z', midnight), true);
  assert.equal(isDepartureToday('2026-10-18T22:59:59Z', midnight), false);
  assert.equal(isDepartureToday('2026-10-19T23:00:00Z', midnight), false);
  assert.equal(isDepartureToday('invalid', midnight), false);
  assert.equal(isDepartureToday(at('10:00'), NaN), false);
});

test('discovery orders accepted trips by departure with stable ties and honors exclusions without mutating the list', () => {
  const candidates = [trip({ id: 'last', departureTime: at('12:00') }), trip({ id: 'b' }), publication(),
    trip({ id: 'a' }), trip({ id: 'foreign', driverId: 'other', departureTime: at('09:00') })];
  const originalOrder = candidates.map(item => item.id);
  assert.equal(selectAcceptedRequestTrip(candidates, 'driver', new Set(), now).id, 'a');
  assert.equal(selectAcceptedRequestTrip(candidates, 'driver', new Set([acceptedRequestEntryKey(trip({ id: 'a' }))]), now).id, 'b');
  assert.deepEqual(candidates.map(item => item.id), originalOrder);
  assert.equal(selectAcceptedRequestTrip([], 'driver', new Set(), now), undefined);
});
