const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { createApi } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const native = { Text: 'Text', View: 'View', TouchableOpacity: 'Button', ScrollView: 'Scroll', StyleSheet: { create: x => x } };

test('publishing lets the driver choose nonempty modes and disables unfunded cash', () => {
  const hooks = hookHarness(); let value = ['points'], funds = 0;
  const { PublishPaymentModes } = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    'expo-router': { useRouter: () => ({ push() {} }) }, '@/store/hooks': { useAppSelector: () => ({ id: 'driver' }) }, '@/store/selectors': {},
    '@/store/api/driverFinanceApi': { useDriverFinanceSummaryQuery: () => ({ currentData: { cash: { enabled: funds > 0, moneyPerToken: 100, availableTokens: funds, debtTokens: 0 } } }) },
  })('features/publish/PublishPaymentModes.tsx');
  const render = () => hooks.render(() => PublishPaymentModes({ value, onChange: fn => { value = fn(value); }, price: 10000 }));
  const boxes = () => nodes(render()).filter(n => n.props?.accessibilityRole === 'checkbox');
  assert.equal(boxes()[2].props.disabled, true);
  boxes()[1].props.onPress(); assert.deepEqual(value, ['points']);
  funds = 4; assert.equal(boxes()[2].props.disabled, true);
  funds = 5; assert.equal(boxes()[2].props.disabled, false);
  boxes()[2].props.onPress(); assert.deepEqual(value, ['points', 'cash']);
  boxes()[1].props.onPress(); assert.deepEqual(value, ['cash']); hooks.unmount();
});

test('arrival choices obey server availability without selecting a different payment automatically', () => {
  const hooks = hookHarness(); const selected = [];
  let available = ['points'];
  const { ArrivalPaymentFields } = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-linking': { createURL: () => 'zwanga://test' },
    '@/store/api/driverFinanceApi': { useBookingPaymentOptionsQuery: () => ({ currentData: { acceptedPaymentModes: ['cash','points'], availablePaymentModes: available } }) },
  })('features/arrival-payment/ArrivalPaymentFields.tsx');
  const render = () => hooks.render(() => ArrivalPaymentFields({ arrivalBooking: { id: 'booking', paymentMode: 'points' },
    paymentAmount: 10000, paymentCurrency: 'CDF', selectedMode: 'points', setSelectedMode: x => selected.push(x), setPaymentError() {}, setStatusMessage() {} }));
  const cards = () => nodes(render()).filter(n => n.props?.accessibilityRole === 'radio');
  let cash = cards().find(n => n.props.accessibilityLabel === 'Espèces');
  assert.equal(cash.props.disabled, true); cash.props.onPress(); assert.deepEqual(selected, []);
  assert.equal(cards().length, 2);
  available = ['points','cash']; cash = cards().find(n => n.props.accessibilityLabel === 'Espèces');
  cash.props.onPress(); assert.deepEqual(selected, ['cash']); hooks.unmount();
});

test('wallet normalization preserves cash holds returned as decimal strings', async t => {
  const baseApi = createApi({ reducerPath: 'testWallet', tagTypes: ['Wallet', 'PaymentHistory'],
    baseQuery: async () => ({ data: { account: { id: 'wallet', balance: '100.00', withdrawableBalance: '70.00', reservedCashCommissionBalance: '40.00' } } }), endpoints: () => ({}) });
  const api = loader({ './baseApi': { baseApi } })('store/api/walletApi.ts').walletApi;
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: get => get().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  const summary = await store.dispatch(api.endpoints.getMyWallet.initiate()).unwrap();
  assert.equal(summary.account.reservedCashCommissionBalance, 40);
});

test('finance API keeps account summaries partitioned by account and sends seat count', async t => {
  const calls = [];
  const baseApi = createApi({ reducerPath: 'testFinance', tagTypes: ['Wallet','Subscription','Booking','Trip'],
    baseQuery: async args => { calls.push(args); return { data: {} }; }, endpoints: () => ({}) });
  const api = loader({ './baseApi': { baseApi } })('store/api/driverFinanceApi.ts').driverFinanceApi;
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: get => get().concat(api.middleware) });
  t.after(() => store.dispatch(api.util.resetApiState()));
  await store.dispatch(api.endpoints.driverFinanceSummary.initiate('driver-a')).unwrap();
  await store.dispatch(api.endpoints.driverFinanceSummary.initiate('driver-b')).unwrap();
  assert.deepEqual(calls, ['/driver-finance/me','/driver-finance/me']);
  await store.dispatch(api.endpoints.tripPaymentOptions.initiate({ tripId: 'trip', numberOfSeats: 3 })).unwrap();
  assert.deepEqual(calls[2], { url: '/driver-finance/trips/trip/payment-options', params: { numberOfSeats: 3 } });
});
