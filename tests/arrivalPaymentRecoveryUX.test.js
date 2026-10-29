const { test } = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flatten = node => React.isValidElement(node) ? [node, ...React.Children.toArray(node.props.children).flatMap(flatten)] : [];
const text = node => typeof node === 'string' || typeof node === 'number' ? String(node)
  : Array.isArray(node) ? node.map(text).join('') : text(node?.props?.children ?? '');

test('pending recovery has one truthful action and an always available exit, never a fake mode switch', () => {
  const native = { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
    StyleSheet: { create: x => x } };
  let cash = 0, verify = 0, change = 0, closed = 0, queryOptions;
  const { ArrivalPaymentRecovery } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-linking': { createURL: () => 'zwanga://payment' }, '@/store/api/driverFinanceApi': {
      useBookingPaymentOptionsQuery: (_id, options) => {
        queryOptions = options;
        return { currentData: { acceptedPaymentModes: ['cash'], availablePaymentModes: ['cash'] } };
      },
    } })('features/arrival-payment/ArrivalPaymentRecovery.tsx');
  const props = { bookingId: 'b', pending: true, busy: false, amount: 4500, currency: 'CDF',
    onVerify: () => verify++, onChange: () => change++, onCash: async () => cash++, onClose: () => closed++ };
  const buttons = () => flatten(ArrivalPaymentRecovery(props)).filter(node => node.type === 'Button');
  assert.ok(buttons().some(node => text(node) === 'Vérifier mon paiement'));
  assert.equal(queryOptions.skip, true, 'no redundant payment-options request while the outcome is unknown');
  assert.equal(buttons().some(node => text(node) === 'Changer de paiement'), false);
  assert.equal(buttons().some(node => /Payer .* en espèces/.test(text(node))), false);
  buttons().find(node => text(node) === 'Vérifier mon paiement').props.onPress(); assert.equal(verify, 1); assert.equal(cash, 0);
  props.pending = false;
  buttons().find(node => /Payer .* en espèces/.test(text(node))).props.onPress(); assert.equal(cash, 1);
  assert.equal(queryOptions.skip, undefined);
  buttons().find(node => text(node) === 'Autre moyen de paiement').props.onPress(); assert.equal(change, 1);
  props.beforeArrival = true;
  assert.equal(buttons().some(node => /Payer .* en espèces/.test(text(node))), false);
  let cardResumed = 0;
  props.pending = true; props.onResumeCard = () => cardResumed++;
  buttons().find(node => text(node) === 'Reprendre le paiement par carte').props.onPress();
  assert.equal(cardResumed, 1);
  props.busy = true;
  const checking = buttons().find(node => text(node) === 'Vérification du paiement…');
  assert.ok(checking.props.disabled); checking.props.onPress(); assert.equal(verify, 1);
  const exit = buttons().find(node => node.props.accessibilityLabel === 'Fermer le paiement pour le moment');
  assert.ok(!exit.props.disabled); exit.props.onPress(); assert.equal(closed, 1);
  assert.doesNotMatch(text(ArrivalPaymentRecovery(props)), /Un instant/);
  const tree = ArrivalPaymentRecovery(props), scroll = flatten(tree).find(node => node.type === 'Scroll');
  assert.equal(flatten(scroll).filter(node => node.type === 'Button').length, buttons().length - 1,
    'all actions except closing can scroll into view on a short screen or with large text');
  props.pending = false; props.savingCash = true;
  assert.match(text(ArrivalPaymentRecovery(props)), /Passage aux espèces/);
  assert.doesNotMatch(text(ArrivalPaymentRecovery(props)), /n’a pas abouti/);
});

test('cash is never offered on missing, failed or disallowing server options', () => {
  let options;
  const { ArrivalPaymentRecovery } = loader({
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-linking': { createURL: () => 'zwanga://payment' },
    '@/store/api/driverFinanceApi': { useBookingPaymentOptionsQuery: () => options },
  })('features/arrival-payment/ArrivalPaymentRecovery.tsx');
  for (options of [{}, { isError: true, currentData: { acceptedPaymentModes: ['cash'], availablePaymentModes: ['cash'] } },
    { currentData: { acceptedPaymentModes: ['cash'], availablePaymentModes: [] } }]) {
    const tree = ArrivalPaymentRecovery({ bookingId: 'b', pending: false, amount: 4500, currency: 'CDF' });
    assert.doesNotMatch(text(tree), /Payer .* en espèces/);
    assert.match(text(tree), /Choisir comment payer/);
  }
});

function recovery(t) {
  const h = hookHarness(), calls = { recover: 0, ack: 0, settled: 0, failed: [], patches: [] };
  let response = { payment: { status: 'pending' } }, live = true;
  const state = { arrivalBooking: { id: 'b' }, activeStoredState: { walletTopUpIntent: 'original' }, user: { id: 'u' },
    isSessionCurrent: () => live, isBusy: false,
    persistBookingState: async (id, patch) => { calls.patches.push({ id, patch }); Object.assign(state.activeStoredState, patch); return true; },
    reportPaymentFailure: id => calls.failed.push(id), setSelectedMode() {},
  };
  const provider = { settleWithPoints: async () => { calls.settled++; return true; } };
  const { useArrivalPaymentRecovery } = loader({ react: h.react, '@/store/api/walletApi': {
    useRecoverWalletTopUpMutation: () => [() => { calls.recover++; return { unwrap: async () => {
      if (response instanceof Error) throw response; return typeof response === 'function' ? response() : response;
    } }; }],
  }, '@/features/wallet/topUpIntent': { acknowledgeWalletTopUpIntent: async () => { calls.ack++; } },
  })('hooks/arrival-payment/useArrivalPaymentRecovery.ts');
  t.after(() => h.unmount());
  return { state, calls, provider, set response(value) { response = value; }, set live(value) { live = value; },
    render: () => h.render(() => useArrivalPaymentRecovery(state, provider, {})) };
}

test('changing payment recovers the original intent once; only a terminal refusal unlocks alternatives', async t => {
  const e = recovery(t); let done;
  e.response = () => new Promise(resolve => { done = resolve; });
  const action = e.render().run; const pending = action(); await action();
  assert.equal(e.calls.recover, 1); assert.equal(e.render().isWorking, true);
  done({ payment: { status: 'failed' } }); await pending;
  assert.equal(e.calls.ack, 1); assert.deepEqual(e.calls.failed, ['b']);
  assert.equal(e.state.activeStoredState.walletTopUpIntent, null);
  assert.equal(e.calls.settled, 0); assert.equal(e.render().isWorking, false);
});

test('unknown outcome and old/unreachable backend keep the original intent and explain the next action', async t => {
  const e = recovery(t);
  await e.render().run(); assert.match(e.render().message, /Ne payez pas en espèces/);
  e.response = new Error('404'); await e.render().run();
  assert.match(e.render().message, /Réessayez ou contactez l’aide/);
  assert.equal(e.state.activeStoredState.walletTopUpIntent, 'original');
  assert.equal(e.calls.ack + e.calls.settled, 0); assert.deepEqual(e.calls.failed, []);
});

test('already received Mobile Money completes the token settlement, never enables cash', async t => {
  const e = recovery(t); e.response = { payment: { status: 'succeeded' } };
  e.provider.settleWithPoints = async () => { e.calls.settled++; return false; };
  await e.render().run(); assert.equal(e.calls.ack, 0); assert.match(e.render().message, /paiement est reçu/);
  e.provider.settleWithPoints = async () => { e.calls.settled++; return true; };
  await e.render().run(); assert.equal(e.calls.ack, 1); assert.deepEqual(e.calls.failed, []);
});

test('late recovery responses cannot change another account or booking', async t => {
  const e = recovery(t); let finish;
  e.response = () => new Promise(resolve => { finish = resolve; });
  const task = e.render().run();
  e.state.arrivalBooking = { id: 'another' }; e.render();
  finish({ payment: { status: 'failed' } }); await task;
  assert.deepEqual(e.calls.patches, []); assert.deepEqual(e.calls.failed, []); assert.equal(e.calls.ack, 0);
  assert.equal(e.render().isWorking, false);
});

test('a stalled intent verification releases the button and ignores a late success without losing its reference', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const e = recovery(t); let finish;
  e.response = () => new Promise(resolve => { finish = resolve; });
  const task = e.render().run(); assert.equal(e.render().isWorking, true);
  t.mock.timers.tick(25000); await task;
  assert.equal(e.render().isWorking, false); assert.match(e.render().message, /Réessayez ou contactez l’aide/);
  assert.equal(e.state.activeStoredState.walletTopUpIntent, 'original');
  finish({ payment: { status: 'succeeded' } }); await new Promise(resolve => setImmediate(resolve));
  assert.equal(e.calls.settled, 0); assert.equal(e.calls.ack, 0); assert.deepEqual(e.calls.patches, []);
});
