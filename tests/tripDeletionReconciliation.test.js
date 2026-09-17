const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

function fixture(serverResult) {
  const requests = [], feedback = [];
  let closed = 0, refreshed = 0;
  const { useTripsManagementActions } = loader({
    '../../features/trips/tripsModel': {},
    '@/store/hooks': { useAppDispatch: () => async action => { requests.push(action); return serverResult; } },
    '@/store/api/tripApi': { tripApi: { endpoints: { getTripById: { initiate: (id, options) => ({ id, options }) } } } },
    '@/utils/errorHelpers': { getApiErrorMessage: (_error, fallback) => fallback },
    '@/utils/mutationReconciliation': { reconcileAmbiguousMutation: async ({ loadSnapshot, isApplied }) => {
      const value = await loadSnapshot(); return value && isApplied(value) ? value : null;
    } },
  })('hooks/trips/useTripsManagementActions.ts');
  const actions = useTripsManagementActions({ deleteTarget: { id: 'trip' },
    deleteTripMutation: () => ({ unwrap: async () => { throw { status: 'FETCH_ERROR' }; } }),
    showFeedback: (...args) => feedback.push(args), closeDeleteModal: () => closed++,
    refetchTrips: async () => { refreshed++; return { data: [] }; },
  });
  return { actions, feedback, requests, closed: () => closed, refreshed: () => refreshed };
}

test('an absent trip in the displayed history page is never mistaken for a confirmed deletion', async () => {
  for (const result of [{ data: { id: 'trip', status: 'completed' } }, { data: { id: 'trip', status: 'cancelled' } }, { error: { status: 503 } }]) {
    const app = fixture(result); await app.actions.handleConfirmDelete();
    assert.equal(app.feedback[0][0], 'error'); assert.equal(app.closed(), 0);
    assert.deepEqual(app.requests, [{ id: 'trip', options: { subscribe: false, forceRefetch: true } }]);
  }
});

test('a confirmed 404 for the exact trip closes the dialog and refreshes the visible list without retrying deletion', async () => {
  const app = fixture({ error: { status: 404 } }); await app.actions.handleConfirmDelete();
  assert.equal(app.feedback[0][0], 'success'); assert.equal(app.closed(), 1); assert.equal(app.refreshed(), 1);
});
