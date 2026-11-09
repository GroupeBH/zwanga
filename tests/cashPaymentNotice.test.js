const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const declared = { type: 'cash_payment_declared', notificationId: id(1), bookingId: id(2), tripId: id(3),
  driverId: 'driver', role: 'driver', amount: 2850, currency: 'CDF', paymentMode: 'cash', passengerName: 'Passager test' };

test('a cash declaration is actionable but never a collected payment; push reloads the REST inbox', () => {
  const load = loader();
  const parse = data => load('features/driver-payments/paymentInbox.ts').paymentInbox({ userId: 'driver', notices: [data] }, 'driver');
  const notice = parse(declared)[0];
  assert.equal(notice.cashDeclared, true); assert.equal(notice.cashReceived, false);
  assert.equal(notice.passengerName, 'Passager test'); assert.match(notice.key, /:cash-declared:2850:CDF$/);
  assert.notEqual(notice.key, parse({ ...declared, amount: 3000 })[0].key);
  for (const invalid of [{ role: 'passenger' }, { driverId: 'other' }, { partial: true }, { paymentMode: 'points' }, { amount: 0 }, { currency: 'EUR' }])
    assert.deepEqual(parse({ ...declared, ...invalid }), []);
  const spoken = load('features/arrival-payment/paymentAnnouncement.ts').driverPaymentAnnouncement(notice);
  assert.match(spoken.text, /indique avoir payé/); assert.match(spoken.text, /Confirmez seulement/);
  assert.doesNotMatch(spoken.text, /paiement.*confirmé/i);
  const push = load('features/notifications/notificationEffects.ts').notificationEffects(declared);
  assert.ok(push.tags.includes('Notification')); assert.equal(push.href.params.id, id(3));
});

function fixture() {
  const hooks = hookHarness(); let calls = 0, finish, fail, session = 1, active = true;
  const { useCashReceiptConfirmation } = loader({ react: hooks.react,
    '@/services/tokenSession': { getTokenSessionVersion: () => session },
    '@/utils/errorHelpers': { getApiErrorMessage: () => 'Connexion indisponible.' },
    '@/store/api/bookingApi': { useConfirmCashReceiptMutation: () => [() => {
      calls++; return { unwrap: () => new Promise((resolve, reject) => { finish = resolve; fail = reject; }) };
    }] },
  })('features/driver-payments/useCashReceiptConfirmation.ts');
  return { hooks, render: () => hooks.render(() => useCashReceiptConfirmation(id(2), 2850, 'CDF', active)),
    calls: () => calls, fail: () => fail(Error('offline')), logout: () => session++, background: () => { active = false; },
    finish: (patch = {}) => finish({ id: id(2), cashReceivedAt: '2026-11-09T12:00:00Z', cashReceivedAmount: '2850', paymentCurrency: 'CDF', ...patch }) };
}
test('one click confirms only the shown amount, ignores duplicate taps and waits for the server', async () => {
  const f = fixture(), receipt = f.render();
  assert.equal(f.calls(), 0);
  const pending = receipt.submit(); await receipt.submit(); assert.equal(f.calls(), 1);
  assert.equal(f.render().busy, true); assert.equal(f.render().received, false);
  f.finish(); assert.equal(await pending, true); assert.equal(f.render().received, true);
  f.hooks.unmount();
});
test('failure or inconsistent reply never confirms cash and can be retried', async () => {
  const f = fixture(); let pending = f.render().submit(); f.fail(); assert.equal(await pending, false);
  assert.equal(f.render().received, false); assert.ok(f.render().error);
  pending = f.render().submit(); f.finish({ cashReceivedAmount: '3000' }); assert.equal(await pending, false);
  pending = f.render().submit(); f.finish(); assert.equal(await pending, true); assert.equal(f.calls(), 3);
  f.hooks.unmount();
});
for (const event of ['logout', 'background', 'unmount']) test(`late cash reply after ${event} cannot acknowledge another screen/account`, async () => {
  const f = fixture(), pending = f.render().submit();
  if (event === 'unmount') f.hooks.unmount(); else { f[event](); f.render(); }
  f.finish(); assert.equal(await pending, false); f.hooks.unmount();
});

test('cash modal offers exactly one explicit receipt action and a not-yet exit, with no confirmation modal', async () => {
  const hooks = hookHarness(); let confirmed = 0, closed = 0, submitted = 0;
  const { CashPaymentRequestNotice } = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
    './useCashReceiptConfirmation': { useCashReceiptConfirmation: () => ({ busy: false, error: '', submit: async () => { submitted++; return true; } }) },
  })('features/driver-payments/CashPaymentRequestNotice.tsx');
  const all = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(all) : [n, ...all(n.props?.children)];
  const tree = hooks.render(() => CashPaymentRequestNotice({ notice: { ...declared, mode: 'cash', cashDeclared: true }, active: true,
    onConfirmed: () => confirmed++, onClose: () => closed++ }));
  const buttons = all(tree).filter(n => n.type === 'Button');
  assert.equal(buttons.length, 2); assert.equal(submitted, 0);
  buttons[1].props.onPress(); assert.equal(closed, 1); assert.equal(submitted, 0);
  await buttons[0].props.onPress(); assert.equal(confirmed, 1); assert.equal(submitted, 1);
  hooks.unmount();
});

test('passenger declaration waits for an owned, unchanged cash booking and rejects stale sessions', async () => {
  const hooks = hookHarness(); let current = true, calls = 0, reply;
  const send = args => { calls++; assert.equal(args.amount, 2850); return { unwrap: async () => reply }; };
  const { usePassengerCashDeclaration } = loader({ react: hooks.react,
    '@/store/api/bookingApi': { useDeclareCashPaymentMutation: () => [send, { isLoading: false }] },
  })('hooks/arrival-payment/usePassengerCashDeclaration.ts');
  const declaration = hooks.render(() => usePassengerCashDeclaration(() => current));
  for (const amount of [0, NaN, Infinity, -1]) await assert.rejects(declaration.declare(id(2), amount, 'CDF'));
  assert.equal(calls, 0);
  reply = { id: id(2), paymentMode: 'cash', paymentStatus: 'not_required', paymentAmount: '2850', paymentCurrency: 'CDF' };
  await declaration.declare(id(2), 2850, 'CDF'); assert.equal(calls, 1);
  for (const patch of [{ id: id(9) }, { paymentAmount: 3500 }, { paymentMode: 'points' }, { paymentStatus: 'pending' }, { paymentCurrency: 'USD' }]) {
    const correct = reply; reply = { ...correct, ...patch };
    await assert.rejects(declaration.declare(id(2), 2850, 'CDF')); reply = correct;
  }
  current = false; const before = calls;
  await assert.rejects(declaration.declare(id(2), 2850, 'CDF')); assert.equal(calls, before);
  hooks.unmount();
});
