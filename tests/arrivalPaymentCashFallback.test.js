const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function flatten(element) {
  if (!React.isValidElement(element)) return [];
  return [element, ...React.Children.toArray(element.props.children).flatMap(flatten)];
}

function form(t) {
  const hooks = hookHarness(), choices = [], complements = [], errors = [];
  let refreshes = 0;
  const query = {
    currentData: { acceptedPaymentModes: ['electronic', 'points', 'cash'], availablePaymentModes: ['electronic', 'points', 'cash'] },
    isError: false, isFetching: false, refetch: async () => { refreshes++; },
  };
  const { ArrivalPaymentFields } = loader({ react: { ...React, ...hooks.react },
    '@/store/api/driverFinanceApi': { useBookingPaymentOptionsQuery: () => query },
    '@/constants/paymentFeatures': { ELECTRONIC_PAYMENTS_ENABLED: true },
    'react-native': { ScrollView: 'Scroll', View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button',
      ActivityIndicator: 'Spinner', Keyboard: { dismiss() {} }, StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-linking': { createURL: () => 'zwanga://booking/payment' },
  })('features/arrival-payment/ArrivalPaymentFields.tsx');
  const props = { arrivalBooking: { id: 'booking', paymentMode: 'electronic' },
    paymentAmount: 4500, paymentCurrency: 'CDF', selectedMode: 'electronic', hasPaymentFailure: true,
    isBusy: false, hasPendingProviderPayment: false, paymentAlreadySucceeded: false,
    moneyComplement: 0, setSelectedMode: mode => choices.push(mode),
    setPaymentError: message => errors.push(message), setStatusMessage() {},
    onSelectCashComplement: value => complements.push(value),
  };
  t.after(() => hooks.unmount());
  return { props, query, choices, complements, errors, get refreshes() { return refreshes; },
    render: () => flatten(hooks.render(() => ArrivalPaymentFields(props))) };
}

test('failed Mobile Money highlights cash with the whole fare; selecting it only changes the draft', t => {
  const env = form(t);
  const buttons = env.render().filter(node => node.props.accessibilityRole === 'radio');
  const cash = buttons[0];
  assert.equal(cash.props.accessibilityLabel, 'Payer en espèces');
  assert.equal(cash.props.disabled, false); assert.equal(cash.props.accessibilityState.checked, false);
  assert.match(flatten(cash).filter(node => node.type === 'Text').map(node => node.props.children).join(''), /4\D?500.*CDF|4\D?500.*FC/);
  assert.deepEqual(env.choices, []);
  cash.props.onPress(); assert.deepEqual(env.choices, ['cash']); assert.deepEqual(env.errors, ['']);
  assert.equal(env.refreshes, 0, 'no additional polling or payment when rendering or selecting cash');
});

test('an unsuccessful token complement offers both full cash and mixed cash without debiting tokens', t => {
  const env = form(t);
  Object.assign(env.props, { selectedMode: 'points', moneyComplement: 3920,
    walletBalance: 58, pointsUsed: 58, amountCoveredByPoints: 580,
    cashComplementAvailable: true, cashRemainder: 3920 });
  const nodes = env.render();
  const full = nodes.find(node => node.props.accessibilityLabel === 'Payer en espèces');
  const mixed = nodes.find(node => node.props.accessibilityLabel === 'Compléter en Espèces');
  assert.ok(full); assert.ok(mixed);
  assert.ok(flatten(mixed).some(node => node.props.children === 'Compléter en espèces'));
  mixed.props.onPress(); assert.deepEqual(env.complements, [true]); assert.deepEqual(env.choices, ['points']);
  full.props.onPress(); assert.deepEqual(env.choices, ['points', 'cash']);
});

test('cash suggestion respects arrival, server eligibility, paid state and pending/unknown payment locks', t => {
  for (const patch of [
    { isBeforeArrival: true }, { isBusy: true }, { hasPendingProviderPayment: true },
    { paymentAlreadySucceeded: true }, { completionSummary: { mode: 'cash', amount: 4500, currency: 'CDF' } },
    { hasPaymentFailure: false }, { selectedMode: 'cash' },
  ]) {
    const env = form(t); Object.assign(env.props, patch);
    assert.equal(env.render().some(node => node.props.accessibilityLabel === 'Payer en espèces'), false);
  }
  for (const available of [undefined, { acceptedPaymentModes: ['electronic'], availablePaymentModes: ['electronic'] },
    { acceptedPaymentModes: ['electronic', 'cash'], availablePaymentModes: ['electronic'], cashUnavailableReason: 'Espèces indisponibles pour ce trajet.' }]) {
    const env = form(t); env.query.currentData = available;
    const nodes = env.render();
    assert.equal(nodes.some(node => node.props.accessibilityLabel === 'Payer en espèces'), false);
    const cash = nodes.find(node => node.props.accessibilityLabel === 'Espèces');
    if (cash) { assert.equal(cash.props.disabled, true); cash.props.onPress(); }
    assert.deepEqual(env.choices, []);
  }
});

test('failed options read never authorizes cash from a stale cache; retry stays in the form', async t => {
  const env = form(t); env.query.isError = true;
  const nodes = env.render();
  assert.equal(nodes.some(node => node.props.accessibilityLabel === 'Payer en espèces'), false);
  const cash = nodes.find(node => node.props.accessibilityLabel === 'Espèces');
  assert.equal(cash.props.disabled, true); cash.props.onPress(); assert.deepEqual(env.choices, []);
  Object.assign(env.props, { selectedMode: 'points', cashComplementAvailable: true, moneyComplement: 3920 });
  const mixed = env.render().find(node => node.props.accessibilityLabel === 'Compléter en Espèces');
  assert.equal(mixed.props.disabled, true); mixed.props.onPress(); assert.deepEqual(env.complements, []);
  const retry = nodes.find(node => node.props.accessibilityLabel === 'Actualiser les moyens de paiement');
  await retry.props.onPress(); assert.equal(env.refreshes, 1);
  env.query.isFetching = true;
  const busy = env.render().find(node => node.props.accessibilityLabel === retry.props.accessibilityLabel);
  assert.equal(busy.props.disabled, true); await busy.props.onPress(); assert.equal(env.refreshes, 1);
  env.query.isFetching = false; env.query.isError = false;
  assert.equal(env.render().find(node => node.props.accessibilityLabel === 'Payer en espèces').props.disabled, false);
});
