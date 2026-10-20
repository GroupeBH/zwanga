const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { validateReferralWithdrawal } = loader()('features/referrals/referralWithdrawalValidation.ts');
const { tokenQuote } = loader()('features/arrival-payment/tokenQuote.ts');
const { mapServerBookingToClient } = loader({ '../trip/tripMapper': { mapServerTripToClient: value => value } })('store/api/booking/bookingMapper.ts');
const summary = availableTokens => ({
  balances: { availableTokens, pendingTokens: 10000, reservedTokens: 10000 },
  withdrawal: { enabled: true, blocked: false, kycApproved: true, minimumTokens: 1000, moneyPerToken: 10, currency: 'CDF' },
});

test('only available referral tokens can cover a withdrawal', () => {
  const result = validateReferralWithdrawal('1000', summary(800));
  assert.equal(result.valid, false);
  assert.match(result.message, /800/);
  assert.match(result.message, /en attente, réservés et du portefeuille/);
});

test('real booking mapping and arrival payment keep the original token quote and current recharge price', () => {
  for (const rate of ['10.0000', '25.0000', '100.0000']) {
    const hooks = hookHarness();
    const booking = mapServerBookingToClient({ id: 'booking', tripId: 'trip', passengerId: 'user', numberOfSeats: 1,
      status: 'completed', droppedOff: true, paymentMode: 'points', paymentStatus: 'pending', paymentAmount: 1000,
      paymentCurrency: 'CDF', cashCommissionTokenValue: rate, updatedAt: new Date().toISOString() });
    assert.equal(booking.cashCommissionTokenValue, rate);
    const mutation = () => [() => { throw new Error('A calculation must not submit payments'); }, { isLoading: false }];
    const { useArrivalPaymentState } = loader({ react: hooks.react,
      'expo-linking': { createURL: () => 'zwanga://booking/payment' },
      '@/hooks/useAppIsActive': { useAppIsActive: () => true },
      './useArrivalPaymentRefresh': { useArrivalPaymentRefresh: () => true },
      './useNearArrivalPayment': { useNearArrivalPayment: () => null },
      './usePaymentPersistence': { usePaymentPersistence: () => ({ storedState: {}, isStoredStateLoaded: true, persistBookingState() {}, isSessionCurrent: () => true }) },
      'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
      'expo-router': { useRouter: () => ({}) },
      '@/store/hooks': { useAppDispatch: () => () => {}, useAppSelector: fn => fn({ trips: { interruptionChoice: null } }) },
      '@/store/selectors': { selectIsAuthenticated: () => true, selectUser: () => ({ id: 'user' }) },
      '@/features/trip/interruptionChoice': { getPassengerInterruptionChoice: () => null },
      '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({ data: [booking], refetch() {} }),
        useInitiateBookingPaymentMutation: mutation, useUpdateBookingPaymentModeMutation: mutation, useLazyCheckBookingPaymentStatusQuery: mutation },
      '@/store/api/paymentApi': { useGetBookingPaymentHistoryQuery: () => ({ data: [], refetch() {} }) },
      '@/store/api/walletApi': { useGetMyWalletQuery: () => ({ refetch() {}, data: { account: { balance: 10, reservedCashCommissionBalance: 5 },
        withdrawal: { moneyPerToken: 10, currency: 'CDF' } } }), useInitiateWalletTopUpMutation: mutation, useLazyCheckWalletTopUpStatusQuery: mutation },
    })('hooks/arrival-payment/useArrivalPaymentState.ts');
    const state = hooks.render(() => useArrivalPaymentState());
    assert.equal(state.requiredPoints, 1000 / Number(rate));
    assert.equal(state.pointsUsed, 5);
    assert.equal(state.missingPoints, 1000 / Number(rate) - 5);
    assert.equal(state.moneyComplement, state.missingPoints * 10);
    hooks.unmount();
  }
});
for (const input of ['', '0', '-1000', '1000.001', '1e3', 'Infinity', 'NaN', '1.000,00']) {
  test(`rejects malformed token input ${input}`, () => assert.equal(validateReferralWithdrawal(input, summary(2000)).valid, false));
}
test('accepts a decimal comma and the exact available amount', () => {
  assert.deepEqual(validateReferralWithdrawal('1000,01', summary(1000.01)), { valid: true, tokens: 1000.01 });
});
test('keeps the 1000-token minimum, KYC and provider policy checks', () => {
  assert.equal(validateReferralWithdrawal('999.99', summary(2000)).title, 'Minimum non atteint');
  const state = summary(2000); state.withdrawal.kycApproved = false;
  assert.equal(validateReferralWithdrawal('1000', state).title, 'Vérification requise');
  state.withdrawal.kycApproved = true; state.withdrawal.blocked = true;
  assert.equal(validateReferralWithdrawal('1000', state).title, 'Retrait indisponible');
  assert.equal(validateReferralWithdrawal('1000').title, 'Solde indisponible');
});

function fixture(t) {
  const hooks = hookHarness(), dialogs = [], calls = [], cleared = [];
  let fresh = summary(2000), refreshError, requestError, refetchError;
  let response = { amount: 10000, currency: 'CDF', status: 'initiated' };
  const { useReferralActions } = loader({
    react: { ...React, ...hooks.react },
    'react-native': { Keyboard: { dismiss() {} } },
    '@/utils/shareReferralLink': {},
    '@/utils/errorHelpers': { getApiErrorMessage: (error, fallback) => error?.data?.message || fallback },
  })('hooks/referrals/useReferralActions.ts');
  const props = {
    isSharing: false, setIsSharing() {}, summary: summary(2000), withdrawalTokens: '1000',
    showDialog: dialog => dialogs.push(dialog), setWithdrawalTokens: value => cleared.push(value),
    refetchSummary: () => ({ unwrap: async () => { if (refetchError) throw refetchError; return fresh; } }),
    requestWithdrawal: payload => ({ unwrap: async () => { calls.push(payload); if (requestError) throw requestError; return response; } }),
    refreshAll: async () => { if (refreshError) throw refreshError; },
  };
  t.after(() => hooks.unmount());
  return { props, dialogs, calls, cleared, render: () => hooks.render(() => useReferralActions(props)),
    setFresh: value => { fresh = value; }, setRefreshError: value => { refreshError = value; },
    setRequestError: value => { requestError = value; }, setRefetchError: value => { refetchError = value; },
    setResponse: value => { response = value; },
  };
}
test('refreshes the balance before sending; a stale sufficient balance cannot authorize a withdrawal', async t => {
  const f = fixture(t); f.setFresh(summary(500)); await f.render().handleWithdrawal();
  assert.equal(f.calls.length, 0); assert.equal(f.dialogs[0].title, 'Solde disponible insuffisant');
});
test('does not send when the current balance cannot be fetched', async t => {
  const f = fixture(t); f.setRefetchError(new Error('offline')); await f.render().handleWithdrawal();
  assert.equal(f.calls.length, 0); assert.match(f.dialogs[0].message, /Aucun retrait/);
});
test('blocks a double tap during the same submission', async t => {
  const f = fixture(t), actions = f.render();
  await Promise.all([actions.handleWithdrawal(), actions.handleWithdrawal()]);
  assert.deepEqual(f.calls, [{ tokens: 1000 }]); assert.equal(f.dialogs[0].title, 'Retrait transmis');
});
test('shows server rejection without clearing the entered amount or retrying POST', async t => {
  const f = fixture(t); f.setRequestError({ data: { message: 'Solde de parrainage disponible insuffisant' } });
  await f.render().handleWithdrawal();
  assert.equal(f.calls.length, 1); assert.equal(f.cleared.length, 0);
  assert.match(f.dialogs[0].message, /disponible insuffisant/);
});
test('a refresh failure after a successful submission is not shown as a failed withdrawal', async t => {
  const f = fixture(t); f.setRefreshError(new Error('refresh offline')); await f.render().handleWithdrawal();
  assert.equal(f.dialogs[0].title, 'Retrait transmis'); assert.equal(f.calls.length, 1);
});
test('does not show success for an HTTP-success response containing a failed payout', async t => {
  const f = fixture(t); f.setResponse({ status: 'failed', failureReason: 'Numéro Mobile Money invalide' });
  await f.render().handleWithdrawal(); assert.equal(f.dialogs[0].variant, 'danger');
});
test('uses the 10 FC fallback, but a server still on 25 FC remains authoritative', () => {
  assert.deepEqual(tokenQuote('CDF'), { bookingValue: 10, purchaseValue: 10 });
  assert.deepEqual(tokenQuote('CDF', null, 25, 'CDF'), { bookingValue: 25, purchaseValue: 25 });
});
test('preserves old booking prices while missing tokens are purchased at the current price', () => {
  assert.deepEqual(tokenQuote('CDF', '25.0000', 10, 'CDF'), { bookingValue: 25, purchaseValue: 10 });
  assert.deepEqual(tokenQuote('CDF', '100.0000', 10, 'CDF'), { bookingValue: 100, purchaseValue: 10 });
  assert.deepEqual(tokenQuote('USD'), { bookingValue: null, purchaseValue: null });
});
