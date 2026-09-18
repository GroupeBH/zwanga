const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loader } = require('./helpers/loadTypeScript.cjs');
const load = loader();
const { buildPaymentNotice } = load('features/driver-payments/paymentNoticeModel.ts');
const { getTripRevenueRows, getTripRevenueMessage } = load('features/driver-payments/tripRevenuePresentation.ts');
const trip = { id: 'trip', price: 5000 };
const booking = { id: 'booking', tripId: 'trip', status: 'completed', paymentMode: 'cash', paymentStatus: 'not_required',
  paymentAmount: 2000, numberOfSeats: 1, paidAt: null, updatedAt: '2026-09-17T21:09:46Z' };

test('arrival, cash not_required and updatedAt are never proof of a passenger payment', () => {
  for (const arrival of [{}, { droppedOff: true }, { droppedOffAt: booking.updatedAt }, { droppedOffConfirmedByPassenger: true }]) {
    assert.equal(buildPaymentNotice({ ...booking, ...arrival }, trip), null);
  }
  assert.equal(buildPaymentNotice({ ...booking, paymentStatus: 'succeeded' }, trip), null);
});

test('successful electronic and token payments retain their notices, without invented paidAt', () => {
  for (const paymentMode of ['electronic', 'points']) {
    const paid = { ...booking, paymentMode, paymentStatus: 'succeeded' };
    assert.equal(buildPaymentNotice(paid, trip).amount, 2000);
    assert.equal(buildPaymentNotice(paid, trip).paidAt, null);
    assert.equal(buildPaymentNotice({ ...paid, paymentStatus: 'pending' }, trip), null);
  }
});

test('failed 3000 FC subsidy remains pending and 2000 FC remains cash owed', () => {
  const summary = { ledgerVerified: true, confirmedAmount: 0, creditPendingAmount: 3000, cashToCollectAmount: 2000 };
  assert.deepEqual(getTripRevenueRows(summary).map(({ key, amount }) => ({ key, amount })), [
    { key: 'creditPending', amount: 3000 }, { key: 'cash', amount: 2000 },
  ]);
  assert.doesNotMatch(getTripRevenueMessage(summary), /crédités|confirmé/i);
});

test('only ledger-verified credits are described as credited, including string push values', () => {
  for (const ledgerVerified of [true, 'true']) {
    assert.equal(getTripRevenueRows({ ledgerVerified, confirmedAmount: '3000' })[0].key, 'confirmed');
  }
  for (const ledgerVerified of [undefined, false, 'false']) {
    const row = getTripRevenueRows({ ledgerVerified, confirmedAmount: 3000 })[0];
    assert.equal(row.key, 'unverified');
    assert.doesNotMatch(row.label, /crédité|ajouté/i);
  }
});

test('presentation omits malformed amounts and preserves electronic pending payments', () => {
  assert.deepEqual(getTripRevenueRows({ confirmedAmount: 'NaN', creditPendingAmount: -1, cashToCollectAmount: Infinity }), []);
  assert.equal(getTripRevenueRows({ electronicPendingAmount: 4750 })[0].key, 'electronicPending');
});
