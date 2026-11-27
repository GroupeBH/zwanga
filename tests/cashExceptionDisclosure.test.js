const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture() {
  const hooks = hookHarness(); let currentData = {}, isFetching = false, isError = false, enabled = true, id = 'booking', refreshes = 0;
  const { useCashExceptionDisclosure } = loader({ react: hooks.react,
    '@/hooks/useDisplayReads': { displayReadOptions: x => ({ skip: !x }), useDisplayReadsEnabled: x => x && enabled },
    '@/store/api/driverFinanceApi': { useBookingPaymentOptionsQuery: () => ({ currentData, isFetching, isError, refetch: () => { refreshes++; } }) },
  })('features/driver-payments/useCashExceptionDisclosure.ts');
  return { hooks, render: () => hooks.render(() => useCashExceptionDisclosure(id, true)),
    change(patch) { if ('data' in patch) currentData = patch.data; if ('fetching' in patch) isFetching = patch.fetching;
      if ('error' in patch) isError = patch.error; if ('online' in patch) enabled = patch.online; if (patch.id) id = patch.id; },
    refreshes: () => refreshes };
}
const exception = n => ({ cashException: { occurrence: n, penaltyAmount: n === 1 ? 0 : 3000, requiresDriverAcknowledgment: true, message: `Conséquences ${n}` } });
test('ordinary receipt is available only after fresh conditions; unknown/offline/error cannot confirm', () => {
  const f = fixture(); assert.equal(f.render().canConfirm, true);
  for (const patch of [{ data: undefined }, { data: {}, fetching: true }, { fetching: false, error: true }, { error: false, online: false }]) {
    f.change(patch); assert.equal(f.render().canConfirm, false);
  }
  f.render().refresh(); assert.equal(f.refreshes(), 0); f.hooks.unmount();
});
test('warning requires an explicit checkbox; another booking or occurrence invalidates consent', () => {
  const f = fixture(); f.change({ data: exception(1) });
  assert.equal(f.render().canConfirm, false); f.render().toggle(); assert.equal(f.render().canConfirm, true);
  assert.equal(f.refreshes(), 0, 'consent has no API mutation');
  f.change({ data: exception(2) }); assert.equal(f.render().canConfirm, false);
  f.render().toggle(); assert.equal(f.render().canConfirm, true);
  f.change({ id: 'another' }); assert.equal(f.render().canConfirm, false); f.hooks.unmount();
});
test('server rejection refresh clears consent; passenger-only redacted policy cannot acknowledge for a driver', () => {
  const f = fixture(); f.change({ data: exception(4) }); f.render().toggle();
  f.render().refresh(); assert.equal(f.refreshes(), 1); assert.equal(f.render().canConfirm, false);
  const redacted = exception(1); delete redacted.cashException.occurrence;
  f.change({ data: redacted }); f.render().toggle(); assert.equal(f.render().canConfirm, false); f.hooks.unmount();
});
test('another passenger receipt on the same trip resets disclosure without adding a new penalty', () => {
  const f = fixture(); f.change({ data: exception(2) }); f.render().toggle();
  assert.equal(f.render().canConfirm, true);
  const alreadyCounted = exception(2);
  Object.assign(alreadyCounted.cashException, { penaltyAmount: 0, alreadyCountedForTrip: true,
    message: 'Exception déjà comptée pour ce trajet : aucune nouvelle pénalité. La commission de ce paiement reste due.' });
  f.change({ data: alreadyCounted });
  assert.equal(f.render().canConfirm, false);
  f.render().toggle(); assert.equal(f.render().canConfirm, true);
  assert.equal(f.render().exception.penaltyAmount, 0);
  assert.equal(f.render().exception.occurrence, 2);
  f.change({ id: 'another-passenger' }); assert.equal(f.render().canConfirm, false);
  f.hooks.unmount();
});
test('receipt sends only the acknowledged ordinal; stale callbacks cannot accept a changed price policy', async () => {
  const hooks = hookHarness(); let ordinal = 1, calls = [], refreshed = 0;
  const { useCashReceiptConfirmation } = loader({ react: hooks.react,
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/utils/errorHelpers': { getApiErrorMessage: () => 'Actualisez' },
    '@/store/api/bookingApi': { useConfirmCashReceiptMutation: () => [args => { calls.push(args); return { unwrap: async () => { throw Error('stale'); } }; }] },
  })('features/driver-payments/useCashReceiptConfirmation.ts');
  const render = () => hooks.render(() => useCashReceiptConfirmation('booking', 1000, 'CDF', true, ordinal, () => refreshed++));
  const previous = render(); ordinal = 2; render();
  assert.equal(await previous.submit(), false); assert.equal(calls.length, 0);
  assert.equal(await render().submit(), false); assert.equal(refreshed, 1);
  assert.deepEqual(calls[0], { bookingId: 'booking', amount: 1000, currency: 'CDF', cashExceptionOccurrence: 2 });
  hooks.unmount();
});
test('options invalidation after dispatch cannot discard the real server receipt or send another one', async () => {
  const hooks = hookHarness(); let ordinal = 1, canSubmit = true, finish, calls = 0;
  const { useCashReceiptConfirmation } = loader({ react: hooks.react,
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/utils/errorHelpers': { getApiErrorMessage: () => 'Erreur' },
    '@/store/api/bookingApi': { useConfirmCashReceiptMutation: () => [() => { calls++; return { unwrap: () => new Promise(ok => { finish = ok; }) }; }] },
  })('features/driver-payments/useCashReceiptConfirmation.ts');
  const render = () => hooks.render(() => useCashReceiptConfirmation('booking', 1000, 'CDF', true, ordinal, undefined, canSubmit));
  const pending = render().submit(); ordinal = undefined; canSubmit = false;
  assert.equal(await render().submit(), false); assert.equal(calls, 1);
  finish({ id: 'booking', cashReceivedAt: 'now', cashReceivedAmount: 1000, paymentCurrency: 'CDF' });
  assert.equal(await pending, true); assert.equal(render().received, true); hooks.unmount();
});
