const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { selectPaymentContext, readPaymentContext } = loader()('store/api/paymentContext.ts');
const now = Date.parse('2026-09-23T09:00:00Z');
const payment = (id, overrides = {}) => ({ id, purpose: 'subscription_pro', status: 'pending',
  orderNumber: id, createdAt: new Date(now - 1000).toISOString(), ...overrides });

test('subscription recovery skips declined, unrelated and old attempts without truncating the search', () => {
  const records = Array.from({ length: 100 }, (_, i) => payment(String(i), { message: 'Transaction échouée' }));
  records.push(payment('valid', { createdAt: new Date(now - 5000).toISOString() }));
  records.push(payment('old', { createdAt: new Date(now - 31 * 60_000).toISOString() }));
  records.push(payment('topup', { purpose: 'wallet_top_up' }));
  assert.deepEqual(selectPaymentContext(records, { kind: 'subscription' }, now).map(item => item.id), ['valid']);
});

test('booking context preserves legacy reference matches and the most recent receipt', () => {
  const context = { kind: 'booking', bookingId: 'b', reference: 'ref', transactionId: 'order' };
  const records = [payment('wrong', { purpose: 'trip_booking', relatedEntityId: 'other' }),
    payment('older', { purpose: 'trip_booking', relatedEntityId: 'b', createdAt: new Date(now - 5000).toISOString() }),
    payment('receipt', { purpose: 'trip_booking', reference: 'ref' })];
  assert.deepEqual(selectPaymentContext(records, context).map(item => item.id), ['receipt']);
  assert.equal(selectPaymentContext([payment('legacy', { purpose: 'trip_booking', orderNumber: 'order' })], context)[0].id, 'legacy');
  assert.equal(selectPaymentContext([payment('trip', { purpose: 'trip_booking', relatedEntityId: 't' })], { ...context, tripId: 't' })[0].id, 'trip');
});

test('targeted reads do not fetch full history except on old backend routes, and never on outages', async () => {
  const context = { kind: 'booking', bookingId: 'b' }, calls = [];
  const result = await readPaymentContext(async args => { calls.push(args); return { data: [] }; }, context);
  assert.deepEqual(result.data, []);
  assert.deepEqual(calls, [{ url: '/payments/history/context', params: context }]);
  await readPaymentContext(async args => { calls.push(args); return { data: [] }; },
    { ...context, tripId: null, transactionId: undefined, reference: '' });
  assert.deepEqual(calls[1].params, context, 'absent UUIDs must not become literal null query parameters');
  for (const status of [401, 403, 429, 500, 502, 'FETCH_ERROR']) {
    let count = 0;
    const failure = await readPaymentContext(async () => { count++; return { error: { status } }; }, context);
    assert.equal(failure.error.status, status); assert.equal(count, 1);
  }
  const fallback = await readPaymentContext(async args => typeof args === 'string'
    ? { data: [payment('receipt', { purpose: 'trip_booking', relatedEntityId: 'b' })] } : { error: { status: 404 } }, context);
  assert.equal(fallback.data[0].id, 'receipt');
});

test('global payment and subscription readers no longer subscribe to full account history', () => {
  for (const file of ['hooks/arrival-payment/useArrivalPaymentState.ts', 'hooks/profile/useProfileData.ts',
    'hooks/subscription-payment/useSubscriptionPaymentState.ts']) {
    assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /useGetPaymentHistoryQuery/);
  }
});
