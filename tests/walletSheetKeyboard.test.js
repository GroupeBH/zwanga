const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const elements = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(elements) : [node, ...elements(node.props?.children)];
const flatStyle = style => Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));

function sheet(platform = 'ios', height = 844) {
  const hooks = hookHarness(); const calls = [];
  const activity = { active: true }; const backHandlers = new Set();
  const window = { width: 390, height }; const insets = { top: 47, bottom: 34, left: 0, right: 0 };
  const native = { Platform: { OS: platform }, View: 'View', Text: 'Text', ScrollView: 'ScrollView', TextInput: 'Input',
    KeyboardAvoidingView: 'KeyboardAvoidingView', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
    RefreshControl: 'RefreshControl', StyleSheet: { create: value => value, absoluteFillObject: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } },
    useWindowDimensions: () => window, Keyboard: { dismiss: () => calls.push('dismiss') },
    BackHandler: { addEventListener: (event, handler) => {
      assert.equal(event, 'hardwareBackPress'); backHandlers.add(handler);
      return { remove: () => backHandlers.delete(handler) };
    } } };
  const mocks = { react: { ...React, ...hooks.react }, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaProvider: 'Provider', SafeAreaView: 'SafeAreaView', useSafeAreaInsets: () => insets },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-router': { Stack: { Screen: 'StackScreen' } },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => activity.active } };
  const load = loader(mocks);
  const { WalletSheetModal, WalletSheetModalBody } = load('features/wallet/WalletSheetModal.tsx');
  const props = { visible: true, title: 'Partager des jetons', subtitle: 'Destinataire', icon: 'share-outline',
    onClose: () => calls.push('close'), children: React.createElement('Input', { value: '25' }) };
  const render = () => hooks.render(() => WalletSheetModal(props));
  const body = () => {
    const bodyElement = elements(render()).find(node => node.type === WalletSheetModalBody);
    return bodyElement ? WalletSheetModalBody(bodyElement.props) : null;
  };
  return { hooks, calls, props, render, body, window, insets, mocks, activity, backHandlers, WalletSheetModalBody };
}

test('iOS wallet uses a bounded, shrinking sheet inside one keyboard adjustment', () => {
  const h = sheet(); const tree = h.body();
  const keyboards = elements(tree).filter(node => node.type === 'KeyboardAvoidingView');
  assert.equal(keyboards.length, 1); const keyboard = keyboards[0];
  assert.equal(keyboard.props.behavior, 'padding');
  assert.equal(flatStyle(keyboard.props.style).flex, 1);
  assert.equal(flatStyle(keyboard.props.style).minHeight, 0);
  const viewport = keyboard.props.children;
  assert.equal(flatStyle(viewport.props.style).flex, 1); assert.equal(flatStyle(viewport.props.style).minHeight, 0);
  assert.ok(flatStyle(viewport.props.style).paddingTop > h.insets.top);
  const card = viewport.props.children; const cardStyle = flatStyle(card.props.style);
  assert.equal(cardStyle.height, Math.round(h.window.height * 0.9));
  assert.equal(cardStyle.minHeight, 0); assert.equal(cardStyle.flexShrink, 1); assert.equal(cardStyle.maxHeight, '100%');
  assert.equal(cardStyle.overflow, 'hidden');
  // Regression: a 90% minimum cannot shrink when padding consumes keyboard space.
  assert.notEqual(cardStyle.minHeight, '90%');
  const header = card.props.children[0];
  assert.equal(flatStyle(header.props.style).flexShrink, 0);
  assert.ok(elements(header).find(node => node.type === 'Button' && node.props.accessibilityLabel === 'Fermer'));
  h.hooks.unmount();
});

test('fields and submit can scroll together without a second iOS keyboard inset', () => {
  const h = sheet(); const tree = h.body();
  const scroll = elements(tree).find(node => node.type === 'ScrollView');
  assert.equal(flatStyle(scroll.props.style).flex, 1); assert.equal(flatStyle(scroll.props.style).minHeight, 0);
  assert.equal(flatStyle(scroll.props.contentContainerStyle).flex, undefined);
  assert.ok(flatStyle(scroll.props.contentContainerStyle).paddingBottom > h.insets.bottom);
  assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  assert.equal(scroll.props.keyboardDismissMode, 'on-drag');
  assert.equal(scroll.props.automaticallyAdjustKeyboardInsets, false);
  assert.equal(scroll.props.automaticallyAdjustContentInsets, false);
  assert.equal(scroll.props.contentInsetAdjustmentBehavior, 'never');
  assert.equal(scroll.props.children, h.props.children);
  assert.equal(elements(scroll).find(node => node.props?.accessibilityLabel === 'Fermer'), undefined);
  h.hooks.unmount();
});

test('Android keeps activity resizing without an additional KeyboardAvoidingView', () => {
  const h = sheet('android'); h.insets.top = 0; h.insets.bottom = 0;
  assert.equal(elements(h.body()).find(node => node.type === 'KeyboardAvoidingView'), undefined);
  assert.ok(elements(h.body()).find(node => node.type === 'ScrollView'));
  assert.equal(h.render().type, 'View');
  assert.equal(h.render().props.presentationStyle, undefined);
  h.hooks.unmount();
});

for (const platform of ['ios', 'android']) {
  test(`${platform}: smaller windows and rotation keep a zero minimum and follow the current window`, () => {
    const h = sheet(platform);
    for (const height of [844, 568, 390, 320, 844]) {
      h.window.height = height;
      const card = elements(h.body()).find(node => flatStyle(node.props?.style).maxHeight === '100%');
      assert.equal(flatStyle(card.props.style).height, Math.round(height * 0.9));
      assert.equal(flatStyle(card.props.style).minHeight, 0);
      assert.equal(flatStyle(card.props.style).flexShrink, 1);
    }
    h.hooks.unmount();
  });
}

test('closed sheets do not render inputs or keyboard avoidance, and reopening retains the parent draft', () => {
  const h = sheet(); h.props.visible = false;
  assert.equal(h.render(), null); assert.equal(h.body(), null);
  h.props.visible = true; const first = h.render();
  const firstBody = elements(first).find(node => node.type === h.WalletSheetModalBody);
  h.props.children = React.createElement('Input', { value: '250' });
  const updated = elements(h.render()).find(node => node.type === h.WalletSheetModalBody);
  assert.equal(updated.type, firstBody.type); assert.equal(updated.key, firstBody.key);
  assert.equal(updated.props.children.props.value, '250');
  h.props.visible = false; assert.equal(h.body(), null);
  h.props.visible = true;
  assert.equal(elements(h.body()).find(node => node.type === 'Input').props.value, '250');
  assert.deepEqual(h.calls, ['dismiss']); h.hooks.unmount();
});

test('close button, backdrop and Android back dismiss the keyboard before closing', () => {
  for (const action of ['Fermer', 'Fermer le formulaire', 'back', 'accessibilityEscape']) {
    const h = sheet(action === 'back' ? 'android' : 'ios');
    if (action === 'back') { h.render(); assert.equal([...h.backHandlers][0](), true); }
    else if (action === 'accessibilityEscape') h.render().props.onAccessibilityEscape();
    else elements(h.body()).find(node => node.type === 'Button' && node.props.accessibilityLabel === action).props.onPress();
    assert.deepEqual(h.calls, ['dismiss', 'close']); h.hooks.unmount();
  }
});

test('typing in the transfer form preserves controlled values and cannot submit or initiate a top-up', () => {
  const h = sheet(); const updates = [];
  const wallet = { activeModal: 'transfer', entries: [], topUpMethod: 'mobile_money', transferAmount: '', transferRecipient: '', transferNote: '',
    setTransferAmount: value => { wallet.transferAmount = value; updates.push('amount'); },
    setTransferRecipient: value => { wallet.transferRecipient = value; updates.push('recipient'); },
    setTransferNote: value => { wallet.transferNote = value; updates.push('note'); },
    handleTransfer: () => updates.push('transfer'), handleTopUp: () => updates.push('top-up'), setActiveModal: value => { wallet.activeModal = value; } };
  const load = loader({ ...h.mocks,
    '../hooks/wallet/useWalletController': { useWalletController: () => wallet },
    '../features/wallet/WalletTopUpModal': { WalletTopUpModal: 'TopUp' },
    '../features/wallet/WalletSheetModal': { WalletSheetModal: 'Sheet' },
    '../features/wallet/walletModel': { formatWalletAmount: () => '0 jeton' },
    'expo-web-browser': { maybeCompleteAuthSession() {} },
  });
  const Screen = load('app/wallet.tsx').default;
  const content = () => elements(Screen()).find(node => node.props?.accessibilityElementsHidden !== undefined);
  const gestureEnabled = () => elements(Screen()).find(node => node.type === 'StackScreen').props.options.gestureEnabled;
  assert.equal(content().props.pointerEvents, 'none');
  assert.equal(content().props.accessibilityElementsHidden, true);
  assert.equal(gestureEnabled(), false);
  const getSheet = () => elements(Screen()).find(node => node.type === 'Sheet');
  const inputs = elements(getSheet()).filter(node => node.type === 'Input');
  assert.equal(inputs.length, 3);
  for (const [index, value] of ['25', '+243999000111', 'Merci'].entries()) {
    assert.equal(inputs[index].props.autoFocus, undefined);
    assert.equal(inputs[index].props.onFocus, undefined);
    inputs[index].props.onChangeText(value);
  }
  assert.deepEqual(updates, ['amount', 'recipient', 'note']);
  assert.deepEqual(elements(getSheet()).filter(node => node.type === 'Input').map(node => node.props.value), ['25', '+243999000111', 'Merci']);
  const button = elements(getSheet()).find(node => node.type === 'Button');
  assert.equal(button.props.onPress, wallet.handleTransfer); button.props.onPress();
  assert.equal(updates.at(-1), 'transfer'); assert.equal(updates.includes('top-up'), false);
  wallet.isTransferring = true;
  assert.equal(elements(getSheet()).find(node => node.type === 'Button').props.disabled, true);
  getSheet().props.onClose(); assert.equal(getSheet().props.visible, false);
  assert.equal(content().props.pointerEvents, 'auto');
  assert.equal(content().props.accessibilityElementsHidden, false);
  assert.equal(content().props.importantForAccessibility, 'auto');
  assert.equal(gestureEnabled(), true);
  assert.equal(wallet.transferAmount, '25'); h.hooks.unmount();
});

test('iOS repeatedly removes the entire touch-blocking layer without native dismissal callbacks', () => {
  const h = sheet();
  for (let cycle = 0; cycle < 40; cycle++) {
    h.props.visible = true;
    const tree = h.render(); const style = flatStyle(tree.props.style);
    assert.equal(tree.type, 'View'); assert.equal(style.position, 'absolute');
    assert.ok(style.zIndex > 0); assert.equal(tree.props.accessibilityViewIsModal, true);
    assert.equal(tree.props.visible, undefined); assert.equal(tree.props.onDismiss, undefined);
    assert.equal(elements(tree).find(node => node.type === 'Modal'), undefined);
    assert.equal(elements(h.body()).find(node => node.type === 'Modal'), undefined);
    elements(h.body()).find(node => node.type === 'Button' && node.props.accessibilityLabel === 'Fermer').props.onPress();
    h.props.visible = false;
    assert.equal(h.render(), null); assert.equal(h.body(), null);
    assert.equal(h.backHandlers.size, 0);
  }
  h.hooks.unmount();
});

test('Android back subscription is unique, stable while typing and released on close, blur and unmount', () => {
  const h = sheet('android'); h.props.visible = false; h.render(); assert.equal(h.backHandlers.size, 0);
  h.props.visible = true; h.render(); assert.equal(h.backHandlers.size, 1);
  const handler = [...h.backHandlers][0];
  for (let count = 0; count < 20; count++) {
    h.props.onClose = () => h.calls.push(`close-${count}`);
    h.props.children = React.createElement('Input', { value: String(count) });
    h.render(); assert.equal(h.backHandlers.size, 1); assert.equal([...h.backHandlers][0], handler);
  }
  handler(); assert.equal(h.calls.at(-1), 'close-19');
  h.activity.active = false; assert.equal(h.render(), null); assert.equal(h.backHandlers.size, 0);
  h.activity.active = true; h.render(); assert.equal(h.backHandlers.size, 1);
  h.props.visible = false; assert.equal(h.render(), null); assert.equal(h.backHandlers.size, 0);
  h.props.visible = true; h.render(); h.hooks.unmount(); assert.equal(h.backHandlers.size, 0);
});

test('inactive iOS wallet screens cannot keep a touch layer above another route', () => {
  const h = sheet(); h.render(); h.activity.active = false;
  assert.equal(h.render(), null); assert.deepEqual(h.calls, ['dismiss']);
  h.activity.active = true; assert.equal(h.render().type, 'View'); h.hooks.unmount();
});

test('top-up keeps its payment and monitoring controls within the same corrected sheet', () => {
  const h = sheet(); const sent = [];
  const { WalletTopUpModal } = loader({ ...h.mocks,
    './WalletSheetModal': { WalletSheetModal: 'Sheet' },
    './walletModel': { TOP_UP_METHOD_OPTIONS: [], normalizePhone: value => value },
  })('features/wallet/WalletTopUpModal.tsx');
  const props = { activeModal: 'top_up', topUpMethod: 'mobile_money', topUpAmount: '50', topUpPhone: '+243999000111',
    isTopUpPhoneRequired: true, topUpOrderNumber: 'order', topUpStatusColor: '#FF6B35', topUpAutoCheckAttempt: 0,
    setTopUpAmount: () => sent.push('amount'), setTopUpPhone: () => sent.push('phone'),
    handleTopUp: () => sent.push('top-up'), handleCheckTopUpStatus: () => sent.push('status'), setActiveModal() {} };
  const tree = WalletTopUpModal(props); assert.equal(tree.type, 'Sheet'); assert.equal(tree.props.visible, true);
  elements(tree).filter(node => node.type === 'Input').forEach(input => input.props.onChangeText('10'));
  assert.deepEqual(sent, ['amount', 'phone']);
  const buttons = elements(tree).filter(node => node.type === 'Button');
  assert.equal(buttons[0].props.onPress, props.handleTopUp); assert.equal(buttons[1].props.onPress, props.handleCheckTopUpStatus);
  assert.equal(WalletTopUpModal({ ...props, activeModal: 'transfer' }).props.visible, false);
  h.hooks.unmount();
});
