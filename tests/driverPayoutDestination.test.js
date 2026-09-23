const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const elements = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(elements) : [node, ...elements(node.props?.children), ...elements(node.props?.ListHeaderComponent), ...elements(node.props?.ListFooterComponent)];
const native = { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ScrollView: 'Scroll',
  FlatList: 'List', StyleSheet: { create: value => value }, ActivityIndicator: 'Spinner', RefreshControl: 'Refresh' };

function formFixture() {
  const changes = []; let confirmations = 0;
  const { PayoutDestinationModal } = loader({ react: React, 'react-native': native,
    '@/features/wallet/WalletSheetModal': { WalletSheetModal: 'WalletSheet' },
  })('features/driver-earnings/PayoutDestinationModal.tsx');
  const props = { visible: true, amount: 9500, currency: 'CDF', phone: '+243891234567', defaultPhone: '0891234567',
    disabled: false, onChangePhone: phone => changes.push(phone), onContinue: () => { confirmations++; }, onClose() {} };
  return { props, changes, render: () => PayoutDestinationModal(props), count: () => confirmations };
}

test('recipient form uses the existing keyboard-safe sheet, editable phone and unchanged-profile notice', () => {
  const f = formFixture(); const tree = f.render();
  assert.equal(tree.type, 'WalletSheet');
  assert.equal(tree.props.visible, true);
  const input = elements(tree).find(node => node.type === 'Input');
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
  assert.equal(buttons.length, 2);
  buttons[0].props.onPress(); assert.deepEqual(f.changes, ['+243891234567']);
  buttons[1].props.onPress(); assert.equal(f.count(), 1);
});

test('earnings main button and failed-payout retry both open the recipient form; the overlay is outside the scroll', () => {
  const hooks = hookHarness(); const opens = [];
  const state = { canSubmit: true, busy: false, openPayoutForm: amount => opens.push(amount),
    payoutForm: { amount: 5000, phone: '+243991234567' }, setPayoutPhone() {}, confirmPayoutForm() {}, closePayoutForm() {} };
  const summary = { payoutPhone: '0891234567', availableBalance: 9500, kycApproved: true, currency: 'CDF' };
  const { default: Screen } = loader({
    react: { ...React, ...hooks.react }, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' }, 'expo-router': { useRouter: () => ({}) },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/utils/reanimated': { default: { View: 'AnimatedView' }, FadeInDown: { delay: () => null } },
    '@/hooks/driver-earnings/useDriverPayout': { useDriverPayout: props => { assert.equal(props.isActive, true); return state; } },
    '@/features/driver-earnings/PayoutHistory': { PayoutHistory: 'History' },
    '@/features/driver-earnings/PayoutDestinationModal': { PayoutDestinationModal: 'DestinationModal' },
    '@/store/api/driverSettlementsApi': { useGetMyDriverSettlementQuery: () => ({ data: summary }),
      useGetDriverEarningsPageQuery: () => ({ currentData: { data: [], total: 0, nextCursor: null } }),
      useGetDriverPayoutsPageQuery: () => ({ currentData: { data: [], total: 0, nextCursor: null } }) },
  })('app/driver-earnings.tsx');
  const tree = hooks.render(Screen), nodes = elements(tree);
  const receive = nodes.find(node => node.type === 'Button' && elements(node).some(child => child.props?.children === 'Recevoir mes gains'));
  receive.props.onPress();
  nodes.find(node => node.type === 'History').props.onRetry(5000);
  assert.deepEqual(opens, [undefined, 5000]);
  const modal = nodes.find(node => node.type === 'DestinationModal');
  assert.equal(modal.props.visible, true);
  assert.equal(modal.props.phone, '+243991234567');
  assert.equal(modal.props.amount, 5000);
  assert.equal(modal.props.defaultPhone, '0891234567');
  assert.ok(!elements(nodes.find(node => node.type === 'List')).includes(modal));
  modal.props.onClose(); hooks.unmount();
});
