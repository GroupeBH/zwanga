const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { reconcileTripMutation, isTripStartStateConflict } = loader({
  '@/constants/network': { MUTATION_RECONCILIATION_DELAYS_MS: [0, 0] },
})('utils/tripStartReconciliation.ts');
const conflict = { status: 400, data: { code: 'TRIP_START_STATE_CHANGED' } };

for (const error of [conflict,
  { status: 400, data: { message: 'Le statut du trajet a changé. Actualisez-le avant de réessayer.' } },
  { status: 400, data: { message: 'Impossible de démarrer le trajet. Statut actuel : ongoing' } },
]) {
  test(`a recognized start conflict rereads authoritative state once: ${JSON.stringify(error.data)}`, async () => {
    let reads = 0;
    const trip = { id: 'trip', status: 'ongoing' };
    const result = await reconcileTripMutation({ error, tripId: 'trip', expectedStatuses: ['ongoing'],
      refetch: async () => { reads++; return { data: trip }; } });
    assert.equal(result, trip); assert.equal(reads, 1);
  });
}

test('pending, terminal, different-trip and failed snapshots never authorize guidance', async () => {
  for (const response of [
    { data: { id: 'trip', status: 'upcoming' } }, { data: { id: 'trip', status: 'cancelled' } },
    { data: { id: 'trip', status: 'completed' } }, { data: { id: 'other', status: 'ongoing' } },
    { data: { id: 'trip', status: 'ongoing' }, error: { status: 'FETCH_ERROR' } }, {},
  ]) {
    let reads = 0;
    assert.equal(await reconcileTripMutation({ error: conflict, tripId: 'trip', expectedStatuses: ['ongoing'],
      refetch: async () => { reads++; return response; } }), null);
    assert.equal(reads, 1);
  }
});

test('other business errors and forbidden responses are not reinterpreted as successful starts', async () => {
  for (const error of [{ status: 400, data: { code: 'PASSENGER_KYC_REQUIRED' } },
    { status: 403, data: conflict.data }, { status: 401 }, { status: 429 }, { status: 500 },
    { status: 400, data: { message: 'Impossible de démarrer le trajet. Statut actuel : cancelled' } },
  ]) {
    assert.equal(isTripStartStateConflict(error), false);
    assert.equal(await reconcileTripMutation({ error, tripId: 'trip', expectedStatuses: ['ongoing'],
      refetch: async () => { assert.fail('must not refetch this error'); } }), null);
  }
});

test('failed verification stays an error; conflict logic is not used for pause or finish', async () => {
  assert.equal(await reconcileTripMutation({ error: conflict, tripId: 'trip', expectedStatuses: ['ongoing'],
    refetch: async () => { throw Error('offline'); } }), null);
  assert.equal(await reconcileTripMutation({ error: conflict, tripId: 'trip', expectedStatuses: ['upcoming'],
    refetch: async () => { assert.fail('not a start'); } }), null);
});

test('transport reconciliation remains bounded and never trusts stale data on a failed fetch', async () => {
  let reads = 0;
  const trip = { id: 'trip', status: 'ongoing' };
  assert.equal(await reconcileTripMutation({ error: { status: 'TIMEOUT_ERROR' }, tripId: 'trip', expectedStatuses: ['ongoing'],
    refetch: async () => { reads++; return reads === 1 ? { data: trip, error: { status: 503 } } : { data: trip }; } }), trip);
  assert.equal(reads, 2);
});
