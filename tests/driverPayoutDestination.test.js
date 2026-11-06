const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const elements = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(elements) : [node, ...elements(node.props?.children), ...elements(node.props?.ListHeaderComponent), ...elements(node.props?.ListFooterComponent)];
const native = { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ScrollView: 'Scroll',
  FlatList: 'List', StyleSheet: { create: value => value }, ActivityIndicator: 'Spinner', RefreshControl: 'Refresh' };

function formFixture() {
  const changes = [], amounts = []; let confirmations = 0;
  const { PayoutDestinationModal } = loader({ react: React, 'react-native': native,
    '@/features/wallet/WalletSheetModal': { WalletSheetModal: 'WalletSheet' },
  })('features/driver-earnings/PayoutDestinationModal.tsx');
  const props = { visible: true, amount: '9500', availableBalance: 9500, minimumAmount: 1000, currency: 'CDF', phone: '+243891234567', defaultPhone: '0891234567',
    disabled: false, onChangeAmount: value => amounts.push(value), onChangePhone: phone => changes.push(phone), onContinue: () => { confirmations++; }, onClose() {} };
  return { props, changes, amounts, render: () => PayoutDestinationModal(props), count: () => confirmations };
}

test('recipient form uses the existing keyboard-safe sheet, editable phone and unchanged-profile notice', () => {
  const f = formFixture(); const tree = f.render();
  assert.equal(tree.type, 'WalletSheet');
  assert.equal(tree.props.visible, true);
  const input = elements(tree).find(node => node.type === 'Input' && node.props.keyboardType === 'phone-pad');
  assert.equal(input.props.value, '+243891234567');
  assert.equal(input.props.editable, true);
  assert.equal(input.props.keyboardType, 'phone-pad');
  assert.notEqual(input.props.autoFocus, true);
  input.props.onChangeText('0991234567');
  assert.deepEqual(f.changes, ['0991234567']);
  assert.ok(elements(tree).some(node => typeof node.props?.children === 'string' && /profil reste inchangé/.test(node.props.children)));
});

test('invalid, empty and busy forms cannot proceed; valid alternative can be confirmed or reset to default', () => {
  const f = formFixture();
  for (const phone of ['', '123', '+33123456789']) {
    f.props.phone = phone;
    const button = elements(f.render()).filter(node => node.type === 'Button').at(-1);
    assert.equal(button.props.disabled, true); button.props.onPress();
  }
  f.props.phone = '0991234567'; f.props.disabled = true;
  assert.equal(elements(f.render()).find(node => node.type === 'Input').props.editable, false);
  elements(f.render()).filter(node => node.type === 'Button').at(-1).props.onPress();
  assert.equal(f.count(), 0);
  f.props.disabled = false;
  const buttons = elements(f.render()).filter(node => node.type === 'Button');
  assert.equal(buttons.length, 3);
  buttons[1].props.onPress(); assert.deepEqual(f.changes, ['+243891234567']);
  buttons[2].props.onPress(); assert.equal(f.count(), 1);
});

test('earnings main button and failed-payout retry both open the recipient form; the overlay is outside the scroll', () => {
  const hooks = hookHarness(); const opens = [];
  const state = { canSubmit: true, busy: false, openPayoutForm: amount => opens.push(amount),
    payoutForm: { amount: '5000', phone: '+243991234567' }, setPayoutPhone() {}, setPayoutAmount() {}, confirmPayoutForm() {}, closePayoutForm() {} };
  const summary = { payoutPhone: '0891234567', availableBalance: 9500, pendingPayoutBalance: 1200,
    paidBalance: 4000, cashReceivedAmount: 50000, kycApproved: true, currency: 'CDF' };
  const { default: Screen } = loader({
    react: { ...React, ...hooks.react }, 'react-native': native,
    '@/store/hooks': { useAppSelector: selector => selector({ zwangaApi: { config: { online: true } } }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' }, 'expo-router': { useRouter: () => ({}) },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/utils/reanimated': { default: { View: 'AnimatedView' }, FadeInDown: { delay: () => null } },
    '@/hooks/driver-earnings/useDriverPayout': { useDriverPayout: props => { assert.equal(props.isActive, true); return state; } },
    '@/features/driver-earnings/PayoutHistory': { PayoutHistory: 'History' },
    '@/features/driver-earnings/CashRevenueSummary': { CashRevenueSummary: 'CashSummary' },
    '@/features/driver-earnings/PayoutDestinationModal': { PayoutDestinationModal: 'DestinationModal' },
    '@/store/api/driverSettlementsApi': { useGetMyDriverSettlementQuery: () => ({ data: summary }),
      useGetDriverEarningsPageQuery: () => ({ currentData: { data: [], total: 0, nextCursor: null } }),
      useGetDriverPayoutsPageQuery: () => ({ currentData: { data: [], total: 0, nextCursor: null } }) },
  })('app/driver-earnings.tsx');
  const tree = hooks.render(Screen), nodes = elements(tree);
  assert.equal(nodes.some(node => node.props?.children === 'Actualisé'), false, 'no unconditional network success badge');
  const details = nodes.find(node => node.type === 'Button' && node.props.accessibilityState?.expanded === false);
  assert.ok(details); details.props.onPress();
  assert.equal(elements(hooks.render(Screen)).find(node => node.type === 'Button' && node.props.accessibilityState?.expanded === true) !== undefined, true);
  const receive = nodes.find(node => node.type === 'Button' && elements(node).some(child => child.props?.children === 'Retirer mes gains'));
  receive.props.onPress();
  assert.equal(nodes.find(node => node.type === 'History'), undefined, 'withdrawals do not clutter the earnings tab');
  nodes.find(node => node.props?.accessibilityRole === 'tab' && elements(node).some(child => child.props?.children === 'Retraits')).props.onPress();
  const withdrawalNodes = elements(hooks.render(Screen));
  withdrawalNodes.find(node => node.type === 'History').props.onRetry(5000);
  assert.deepEqual(opens, [undefined, 5000]);
  for (const label of ['Disponible à retirer', 'Retrait en cours', 'Déjà retiré']) {
    assert.ok(nodes.some(node => node.props?.children === label));
  }
  for (const amount of [9500, 1200, 4000]) {
    const formatted = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(amount) + ' CDF';
    assert.ok(nodes.some(node => node.props?.children === formatted), `global summary amount ${amount} remains visible with an empty page`);
  }
  assert.equal(withdrawalNodes.find(node => node.type === 'History').props.availableBalance, 9500);
  assert.equal(nodes.find(node => node.type === 'CashSummary').props.amount, 50000);
  const modal = nodes.find(node => node.type === 'DestinationModal');
  assert.equal(modal.props.visible, true);
  assert.equal(modal.props.phone, '+243991234567');
  assert.equal(modal.props.amount, '5000');
  assert.equal(modal.props.availableBalance, 9500);
  assert.equal(modal.props.defaultPhone, '0891234567');
  assert.ok(!elements(nodes.find(node => node.type === 'List')).includes(modal));
  modal.props.onClose(); hooks.unmount();
});

test('amount input accepts a partial amount; Tout retirer uses the current available balance only', () => {
  const f = formFixture(); f.props.amount = '2500';
  const tree = f.render(), input = elements(tree).find(node => node.props?.keyboardType === 'decimal-pad');
  assert.equal(input.props.value, '2500'); assert.equal(input.props.editable, true);
  input.props.onChangeText('3000'); assert.deepEqual(f.amounts, ['3000']);
  const all = elements(tree).find(node => node.type === 'Button' && elements(node).some(child => child.props?.children === 'Tout retirer'));
  all.props.onPress(); assert.deepEqual(f.amounts, ['3000', '9500']);
  const remaining = elements(tree).find(node => node.props?.style && node.props?.accessibilityLiveRegion === 'polite');
  assert.ok(JSON.stringify(remaining.props.children).includes('7 000 CDF'));
  assert.equal(elements(tree).filter(node => node.type === 'Button').at(-1).props.disabled, false);
});

test('amount errors disable Continue without rounding or silently using all funds', () => {
  const f = formFixture();
  for (const amount of ['', '0', '999', '9501', '12,345', '1e3']) {
    f.props.amount = amount; const tree = f.render();
    const button = elements(tree).filter(node => node.type === 'Button').at(-1);
    assert.equal(button.props.disabled, true, amount); button.props.onPress();
    assert.equal(f.count(), 0);
  }
});

test('amount parser handles French separators and rejects ambiguous or unsafe numeric values', () => {
  const { parsePayoutAmount, payoutAmountError } = loader()('features/driver-earnings/payoutModel.ts');
  for (const value of ['2 500,50', '2 500.50', '2500.5']) assert.equal(parsePayoutAmount(value), 2500.5);
  for (const value of ['NaN', 'Infinity', '-1', '1e3', '10,123', '1.234,50', '1,', '9007199254740992', ''])
    assert.equal(parsePayoutAmount(value), null, value);
  assert.equal(payoutAmountError('1000', 1000, 1000), null);
  assert.notEqual(payoutAmountError('1000', NaN, 1000), null);
  assert.notEqual(payoutAmountError('1000', 5000, NaN), null);
});
