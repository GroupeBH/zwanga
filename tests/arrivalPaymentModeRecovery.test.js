const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('a confirmed failure allows choosing any other mode without defaulting to cash or making a request', () => {
  for (const original of ['electronic', 'points', 'cash']) {
    const hooks = hookHarness();
    const { useBookingPaymentMode } = loader({ react: hooks.react })('hooks/arrival-payment/useBookingPaymentMode.ts');
    const booking = { id: 'booking', paymentMode: original, paymentStatus: 'pending' };
    const render = () => hooks.render(() => useBookingPaymentMode(booking));
    assert.equal(render().canChangeFailedPaymentMode, false);
    render().reportPaymentFailure(booking.id);
    assert.equal(render().canChangeFailedPaymentMode, true);
    render().setSelectedMode(null);
    assert.equal(render().selectedMode, null);
    assert.equal(render().canChangeFailedPaymentMode, false);
    for (const next of ['cash', 'points', 'electronic']) {
      render().setSelectedMode(next);
      assert.equal(render().selectedMode, next);
    }
    assert.equal(booking.paymentMode, original, 'selection does not update the server booking');
    hooks.unmount();
  }
});

test('pending references, busy state and confirmed payment lock mode changes; failure belongs to one booking', () => {
  const hooks = hookHarness();
  const { useBookingPaymentMode } = loader({ react: hooks.react })('hooks/arrival-payment/useBookingPaymentMode.ts');
  let booking = { id: 'a', paymentMode: 'electronic', paymentStatus: 'pending' }, stored, busy = false;
  const render = () => hooks.render(() => useBookingPaymentMode(booking, stored, busy));
  render().reportPaymentFailure('a');
  for (const reference of ['bookingPaymentOrderNumber', 'walletTopUpOrderNumber']) {
    stored = { [reference]: 'existing-order' };
    assert.equal(render().canChangeFailedPaymentMode, false);
    render().setSelectedMode('cash');
    assert.notEqual(render().selectedMode, 'cash');
  }
  stored = undefined; busy = true;
  assert.equal(render().canChangeFailedPaymentMode, false);
  render().setSelectedMode(null); assert.equal(render().selectedMode, 'electronic');
  busy = false; booking = { ...booking, paymentStatus: 'succeeded' };
  assert.equal(render().canChangeFailedPaymentMode, false);
  render().setSelectedMode('cash'); assert.equal(render().selectedMode, 'electronic');
  booking = { ...booking, paymentStatus: 'not_required', cashReceivedAt: 'confirmed' };
  assert.equal(render().canChangeFailedPaymentMode, false);
  booking = { id: 'b', paymentMode: 'points', paymentStatus: 'pending' };
  assert.equal(render().canChangeFailedPaymentMode, false);
  render().reportPaymentFailure('a');
  assert.equal(render().canChangeFailedPaymentMode, false, 'late failure cannot reset another booking');
  hooks.unmount();
});

test('completion reports failed/cancelled payments only, never pending or succeeded, and ignores inactive sessions', async () => {
  const hooks = hookHarness(), failures = [], patches = [];
  let current = true;
  const { useArrivalPaymentCompletion } = loader({ react: hooks.react,
    'expo-linking': { createURL: () => 'zwanga://booking/payment' },
  })('hooks/arrival-payment/useArrivalPaymentCompletion.ts');
  const api = hooks.render(() => useArrivalPaymentCompletion({
    isSessionCurrent: () => current,
    refetchBookings: async () => ({}), refetchWallet: async () => ({}), refetchPaymentHistory: async () => ({}),
    paymentHistory: [], setPaymentError() {}, setStatusMessage() {}, setCompletionSummary() {},
    persistBookingState: (id, patch) => patches.push({ id, patch }),
    reportPaymentFailure: id => failures.push(id),
  }));
  for (const status of ['pending', 'failed', 'cancelled', 'succeeded']) {
    const response = { booking: { id: status, status: 'completed', paymentMode: 'electronic', paymentAmount: 1500 },
      payment: { status, amount: 1500 } };
    assert.equal(await api.handleCompletedBookingPayment(response), status !== 'pending');
  }
  assert.deepEqual(failures, ['failed', 'cancelled']);
  assert.equal(patches.length, 3);
  current = false;
  await api.handleCompletedBookingPayment({ booking: { id: 'stale' }, payment: { status: 'failed', amount: 1500 } });
  assert.deepEqual(failures, ['failed', 'cancelled']);
  hooks.unmount();
});

test('footer keeps only payment and close, without a redundant mode-change button', () => {
  let paid = 0, retried = 0;
  const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
    Keyboard: { dismiss() {} }, StyleSheet: { create: value => value } };
  const { ArrivalPaymentActions } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } })('features/arrival-payment/ArrivalPaymentActions.tsx');
  const props = { isBusy: false, hasPendingProviderPayment: false, paymentAlreadySucceeded: false,
    selectedMode: 'points', actionLabel: 'Payer', isPayButtonDisabled: true,
    verification: { phase: 'idle', message: '' }, onClose() {},
    onPay: async () => paid++, onRetry: () => retried++ };
  const nodes = () => flatten(ArrivalPaymentActions(props));
  const change = () => nodes().find(child => child.props.testID === 'arrival-payment-change-mode');
  const button = () => nodes().find(child => child.type === 'Button');
  const label = () => React.Children.toArray(button().props.children).find(child => child.type === 'Text').props.children;
  assert.equal(change(), undefined);
  assert.equal(nodes().filter(child => child.type === 'Button').length, 2);
  assert.equal(label(), 'Payer', 'the payment action keeps its own label');
  props.hasPendingProviderPayment = true; props.verification = { phase: 'paused', message: 'Vérification indisponible' };
  assert.equal(label(), 'Vérifier à nouveau');
  button().props.onPress(); assert.equal(retried, 1); assert.equal(paid, 0);
  props.isBusy = true; assert.equal(button().props.disabled, true);
  props.isBusy = false; props.hasPendingProviderPayment = false;
  props.paymentAlreadySucceeded = true;
  assert.equal(change(), undefined, 'no mode change after successful payment');
});

function flatten(element) {
  if (!React.isValidElement(element)) return [];
  return [element, ...React.Children.toArray(element.props.children).flatMap(flatten)];
}

test('a confirmed decline unlocks direct selection once its pending reference is cleared', () => {
  const hooks = hookHarness();
  const { useBookingPaymentMode } = loader({ react: hooks.react })('hooks/arrival-payment/useBookingPaymentMode.ts');
  const booking = { id: 'booking', paymentMode: 'points', paymentStatus: 'pending' };
  let stored = { walletTopUpOrderNumber: 'existing-order' };
  const render = () => hooks.render(() => useBookingPaymentMode(booking, stored));
  render().setSelectedMode('cash');
  assert.equal(render().selectedMode, 'points');
  assert.equal(stored.walletTopUpOrderNumber, 'existing-order');
  render().reportPaymentFailure('booking');
  assert.equal(render().canChangeFailedPaymentMode, false);
  stored = { walletTopUpOrderNumber: null };
  assert.equal(render().canChangeFailedPaymentMode, true);
  render().setSelectedMode('cash');
  assert.equal(render().selectedMode, 'cash');
  assert.equal(render().canChangeFailedPaymentMode, false);
  assert.equal(booking.paymentMode, 'points', 'a choice is not a server payment');
  hooks.unmount();
});

test('a decline reveals selectable mode cards directly, with no new button, payment or repeated scrolling', () => {
  const hooks = hookHarness(), scrolls = [], choices = [];
  const native = { ScrollView: 'Scroll', View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button',
    ActivityIndicator: 'Spinner', Keyboard: { dismiss() {} }, StyleSheet: { create: value => value } };
  const { ArrivalPaymentFields } = loader({ react: { ...React, ...hooks.react },
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-linking': { createURL: () => 'zwanga://booking/payment' },
  })('features/arrival-payment/ArrivalPaymentFields.tsx');
  const props = { arrivalBooking: { id: 'booking', paymentAmount: 1500 }, destination: 'Destination',
    paymentAmount: 1500, paymentCurrency: 'CDF', paymentAlreadySucceeded: false,
    selectedMode: 'points', hasPaymentFailure: false, walletBalance: 15, pointsUsed: 15,
    hasPendingProviderPayment: true, isBusy: false,
    setSelectedMode: mode => choices.push(mode), setPaymentError() {}, setStatusMessage() {},
    amountCoveredByPoints: 1500, moneyComplement: 0 };
  const render = () => hooks.render(() => ArrivalPaymentFields(props));
  const form = render(); form.props.ref.current = { scrollTo: value => scrolls.push(value) };
  flatten(form).find(child => child.props.onLayout).props.onLayout({ nativeEvent: { layout: { y: 210 } } });
  assert.equal(scrolls.length, 0);
  assert.ok(flatten(form).filter(child => child.props.accessibilityRole === 'radio').every(child => child.props.disabled));
  props.hasPaymentFailure = true; props.hasPendingProviderPayment = false;
  const failedForm = render();
  assert.deepEqual(scrolls, [{ y: 210, animated: false }]);
  const cards = flatten(failedForm).filter(child => child.props.accessibilityRole === 'radio');
  assert.ok(cards.length >= 2);
  assert.ok(cards.every(card => !card.props.disabled));
  const cash = cards.find(card => card.props.accessibilityLabel === 'Espèces');
  cash.props.onPress(); assert.deepEqual(choices, ['cash']);
  for (let i = 0; i < 100; i++) render();
  assert.equal(scrolls.length, 1, 'store rerenders do not drive another scroll');
  props.isBeforeArrival = true;
  assert.equal(flatten(render()).some(child => child.props.accessibilityLabel === 'Espèces'), false);
  hooks.unmount();
});
