const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(words).join('') : words(node?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', ScrollView: 'Scroll', TextInput: 'Input', TouchableOpacity: 'Button',
  ActivityIndicator: 'Spinner', KeyboardAvoidingView: 'Keyboard', Platform: { OS: 'ios' },
  Keyboard: { dismiss() {} }, StyleSheet: { create: value => value, hairlineWidth: 1 } };
const mocks = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-linking': { createURL: () => 'zwanga://payment' } };
mocks['@/store/api/driverFinanceApi'] = { useBookingPaymentOptionsQuery: () => ({ currentData: {
  acceptedPaymentModes: ['cash', 'electronic', 'points'], availablePaymentModes: ['cash', 'electronic', 'points'], cashUnavailableReason: null,
} }) };
const booking = { id: 'booking', tripId: 'trip', passengerId: 'passenger', status: 'completed', droppedOff: true,
  numberOfSeats: 3, paymentAmount: 3000, paymentCurrency: 'CDF', paymentMode: 'electronic', paymentStatus: 'pending', passengerDestination: 'Destination de test' };
const noop = () => {};

test('one payment modal keeps the same content component from selection through receipt, with one close action', () => {
  const hooks = hookHarness();
  const state = { arrivalBooking: booking, isAuthenticated: true, isAppActive: true, isResumeReady: true, insets: { bottom: 0 },
    selectedMode: 'electronic', selectedChannel: 'mpesa', paymentAmount: 3000, paymentCurrency: 'CDF', mobileMoneyPhone: '+243000000000',
    isBeforeArrival: false, paymentAlreadySucceeded: false, completionSummary: null, paymentHistory: [],
    setCompletionSummary: noop, deferPayment: noop, deferEarlyPayment: noop, acknowledgeBooking: noop };
  let submitting = false;
  const done = () => {};
  const { PassengerArrivalPaymentCoordinator } = loader({ ...mocks, react: { ...React, ...hooks.react },
    'expo-web-browser': { maybeCompleteAuthSession: noop }, '@/components/forms/FormLayout': { FormModal: 'Modal' },
    '@/store/hooks': { useAppSelector: fn => fn() }, '@/store/selectors': { selectUser: () => ({ id: 'passenger' }), selectIsAuthenticated: () => true },
    '../hooks/arrival-payment/useArrivalPaymentState': { useArrivalPaymentState: () => state },
    '../hooks/arrival-payment/useArrivalPaymentCompletion': { useArrivalPaymentCompletion: () => ({ showCompletionSummary: noop }) },
    '../hooks/arrival-payment/useArrivalPaymentProvider': { useArrivalPaymentProvider: () => ({}) },
    '../hooks/arrival-payment/useArrivalPaymentMonitoring': { useArrivalPaymentMonitoring: () => ({ verification: { phase: 'idle' } }) },
    '../hooks/arrival-payment/useArrivalPaymentSubmission': { useArrivalPaymentSubmission: () => ({ handlePayment: noop, isSubmitting: submitting }) },
    '../hooks/arrival-payment/useArrivalPaymentNavigation': { useArrivalPaymentNavigation: () => ({ handleDismissSummary: done }) },
    '../features/arrival-payment/ArrivalPaymentFields': { ArrivalPaymentFields: 'Fields' },
    '../features/arrival-payment/ArrivalPaymentActions': { ArrivalPaymentActions: 'Actions' },
    '@/components/trip/PassengerInterruptionChoice': { PassengerInterruptionChoice: 'Interruption' },
    '@/features/arrival-payment/PendingPaymentReminder': { PendingPaymentReminder: 'Reminder' },
    '@/store/slices/tripsSlice': { openInterruptionChoice: noop },
  })('components/PassengerArrivalPaymentCoordinator.tsx');
  const session = PassengerArrivalPaymentCoordinator();
  const render = () => hooks.render(() => session.type());
  const find = (tree, type) => all(tree).find(node => node.type === type);
  let tree = render(); assert.equal(all(tree).filter(node => node.type === 'Modal').length, 1);
  assert.equal(find(tree, 'Modal').props.visible, true); assert.equal(find(tree, 'Fields').props.completionSummary, null);
  submitting = true; tree = render(); assert.equal(find(tree, 'Actions').props.isBusy, true); assert.equal(find(tree, 'Fields').props.isBusy, true);
  submitting = false; state.paymentAlreadySucceeded = true; state.arrivalBooking = { ...booking, paymentStatus: 'succeeded', paymentReference: 'REF-TEST' };
  tree = render(); assert.equal(all(tree).filter(node => node.type === 'Fields').length, 1);
  assert.equal(find(tree, 'Fields').props.completionSummary.paymentReference, 'REF-TEST');
  assert.equal(find(tree, 'Actions').props.onDone, done); assert.equal(find(tree, 'Modal').props.onRequestClose, done);
  state.isPaymentDeferred = true; assert.equal(find(render(), 'Modal').props.visible, false);
  state.isPaymentDeferred = false; state.isBeforeArrival = true; state.paymentAlreadySucceeded = false;
  tree = render(); assert.equal(find(tree, 'Actions').props.closeLabel, 'Payer à l’arrivée');
  assert.equal(find(tree, 'Actions').props.onClose, state.deferEarlyPayment);
  assert.equal(all(tree).filter(node => node.type === 'Button').length, 0, 'no third footer button around Actions');
  state.isAppActive = false; assert.equal(find(render(), 'Modal').props.visible, false);
  hooks.unmount();
});

test('payment fields show group total, cash instructions and provider status without additional modal', () => {
  const hooks = hookHarness();
  const { ArrivalPaymentFields } = loader({ ...mocks, react: { ...React, ...hooks.react },
    './ArrivalPaymentReceipt': { ArrivalPaymentReceipt: 'Receipt' },
  })('features/arrival-payment/ArrivalPaymentFields.tsx');
  const props = { arrivalBooking: booking, destination: booking.passengerDestination, paymentAmount: 3000, paymentCurrency: 'CDF',
    selectedMode: 'cash', selectedChannel: 'mpesa', setSelectedMode: noop, setPaymentError: noop, setStatusMessage: noop,
    paymentPhone: '', hasPendingProviderPayment: false };
  const render = () => hooks.render(() => ArrivalPaymentFields(props));
  let tree = render(); assert.match(words(tree), /Total pour 3 places/); assert.match(words(tree), /À remettre au conducteur/);
  assert.doesNotMatch(words(tree), /Paiement confirmé/); assert.equal(tree.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(all(tree).some(node => node.type === 'Modal'), false);
  props.selectedMode = 'electronic'; props.hasPendingProviderPayment = true; props.statusMessage = 'duplicate waiting text';
  tree = render(); assert.match(words(tree), /ne payez pas une seconde fois/); assert.doesNotMatch(words(tree), /duplicate waiting text/);
  assert.ok(all(tree).filter(node => node.props?.accessibilityRole === 'radio').every(node => node.props.disabled));
  props.completionSummary = { bookingId: 'booking', amount: 2500, mode: 'electronic', currency: 'CDF', numberOfSeats: 3 };
  tree = render(); assert.match(words(tree), /Paiement confirmé/); assert.match(words(tree), /Rien à payer de nouveau/);
  assert.equal(all(tree).filter(node => node.props?.accessibilityRole === 'radio').length, 0);
  assert.equal(all(tree).filter(node => node.type === 'Receipt').length, 1);
  hooks.unmount();
});

test('a free trip without a payment mode has a closable receipt and never implies cash', () => {
  const { buildPaymentCompletionSummary } = loader(mocks)('features/arrival-payment/buildPaymentCompletionSummary.ts');
  const summary = buildPaymentCompletionSummary({ ...booking, paymentAmount: 0, paymentMode: null }, undefined, [], {});
  assert.equal(summary.mode, null); assert.equal(summary.amount, 0); assert.equal(summary.cashInstructions, false);
  const { ArrivalPaymentReceipt } = loader({ ...mocks, react: { ...React, memo: value => value } })('features/arrival-payment/ArrivalPaymentReceipt.tsx');
  assert.match(words(ArrivalPaymentReceipt({ summary })), /Aucun \(trajet gratuit\)/);
  assert.equal(buildPaymentCompletionSummary({ ...booking, paymentMode: null }, undefined, [], {}), null, 'unknown paid mode remains unknown');
});

test('receipt exposes a selectable reference and only its useful wallet details; finishing does not pay again', () => {
  const load = loader({ ...mocks, react: { ...React, memo: value => value } });
  const { ArrivalPaymentReceipt } = load('features/arrival-payment/ArrivalPaymentReceipt.tsx');
  const { ArrivalPaymentActions } = load('features/arrival-payment/ArrivalPaymentActions.tsx');
  const summary = { mode: 'points', amount: 3000, walletBalance: 25, earnedPointsKnown: true, earnedPoints: 2,
    paymentReference: 'LONG-REFERENCE-TEST', invoiceUrl: '/payment-history', driverNotice: 'Paiement confirmé' };
  const tree = ArrivalPaymentReceipt({ summary });
  assert.match(words(tree), /Solde de jetons.*Jetons gagnés.*LONG-REFERENCE-TEST/);
  const ref = all(tree).find(node => node.props?.children === 'LONG-REFERENCE-TEST');
  assert.equal(ref.props.selectable, true); assert.equal(ref.props.numberOfLines, undefined);
  let closed = 0, invoice = 0;
  const actions = ArrivalPaymentActions({ completionSummary: summary, onPay: () => assert.fail('no payment from a receipt'),
    onDone: () => closed++, onInvoice: () => invoice++ });
  const buttons = all(actions).filter(node => node.type === 'Button');
  assert.equal(buttons.length, 2); buttons[0].props.onPress(); buttons[1].props.onPress();
  assert.equal(closed, 1); assert.equal(invoice, 1);
  const cash = ArrivalPaymentReceipt({ summary: { ...summary, mode: 'cash', cashInstructions: true, paymentReference: null } });
  assert.doesNotMatch(words(cash), /Solde de jetons|Jetons gagnés|Référence/);
});
