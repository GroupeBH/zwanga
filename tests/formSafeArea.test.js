/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const native = {
  Platform: { OS: 'android' }, StyleSheet: { create: value => value },
  Modal: 'Modal', View: 'View', ScrollView: 'ScrollView', Text: 'Text',
  TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity',
  KeyboardAvoidingView: 'KeyboardAvoidingView', ActivityIndicator: 'ActivityIndicator',
};
const safeArea = { SafeAreaProvider: 'SafeAreaProvider', SafeAreaView: 'SafeAreaView' };
const read = file => fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
const loadLayout = (os = 'android') => loader({
  'react-native': { ...native, Platform: { OS: os } },
  'react-native-safe-area-context': safeArea,
})('components/forms/FormLayout.tsx');

test('Android form modals measure their own window and preserve native callbacks and presentation', () => {
  const { FormModal, FormScreen } = loadLayout();
  const calls = [];
  const props = { visible: true, transparent: true, statusBarTranslucent: true,
    navigationBarTranslucent: true, animationType: 'slide', presentationStyle: 'overFullScreen',
    onShow: () => calls.push('show'), onDismiss: () => calls.push('dismiss'),
    onRequestClose: () => calls.push('back'), children: 'form' };
  const result = FormModal(props);
  assert.equal(result.type, 'Modal');
  for (const [key, value] of Object.entries(props)) if (key !== 'children') assert.equal(result.props[key], value);
  assert.equal(result.props.children.type, FormScreen);
  assert.equal(result.props.children.props.children, 'form');
  result.props.onShow(); result.props.onRequestClose(); result.props.onDismiss();
  assert.deepEqual(calls, ['show', 'back', 'dismiss']);
  assert.equal(FormModal({ visible: false }).props.visible, false);
});

test('iOS keeps its existing modal layout and pageSheet presentation', () => {
  const { FormModal } = loadLayout('ios');
  const result = FormModal({ visible: true, presentationStyle: 'pageSheet', children: 'existing iOS content' });
  assert.equal(result.props.presentationStyle, 'pageSheet');
  assert.equal(result.props.children, 'existing iOS content');
});

test('safe form screens protect all edges once and remeasure remaining insets for their children', () => {
  const { FormScreen } = loadLayout();
  const style = { backgroundColor: 'white' };
  const result = FormScreen({ style, testID: 'form', children: 'form content' });
  assert.equal(result.type, 'SafeAreaProvider');
  assert.equal(result.props.initialMetrics, undefined);
  const safeView = result.props.children;
  assert.equal(safeView.type, 'SafeAreaView');
  assert.deepEqual(safeView.props.edges, ['top', 'right', 'bottom', 'left']);
  assert.equal(safeView.props.testID, 'form');
  assert.equal(safeView.props.style.at(-1), style);
  const remaining = safeView.props.children;
  assert.equal(remaining.type, 'SafeAreaProvider');
  assert.equal(remaining.props.initialMetrics, undefined);
  assert.equal(remaining.props.children, 'form content');
});

function vehicleForm() {
  const hooks = hookHarness();
  const listeners = new Map();
  const calls = [];
  const { VehicleFormModal } = loader({
    react: hooks.react, 'react-native-safe-area-context': safeArea,
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-native': { ...native, Keyboard: {
      dismiss: () => calls.push('dismiss'),
      addListener: (event, listener) => { listeners.set(event, listener); return { remove: () => listeners.delete(event) }; },
    } },
  })('components/VehicleFormModal.tsx');
  const props = { visible: false, vehicleType: 'car', brand: '', model: '', color: '', licensePlate: '',
    onClose: () => calls.push('close'), onSubmit: () => calls.push('submit') };
  return { hooks, listeners, calls, props, render: () => hooks.render(() => VehicleFormModal(props)) };
}

function elements(node, ancestors = [], result = []) {
  if (!node || typeof node !== 'object') return result;
  if (Array.isArray(node)) { node.forEach(child => elements(child, ancestors, result)); return result; }
  result.push({ node, ancestors });
  elements(node.props?.children, [...ancestors, node], result);
  return result;
}

test('vehicle fields scroll within a bounded sheet while submit and cancel remain outside the scroll', () => {
  const env = vehicleForm(); env.props.visible = true;
  const entries = elements(env.render());
  const scroll = entries.find(({ node }) => node.type === 'ScrollView').node;
  assert.equal(scroll.props.style.flex, 1);
  assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  const action = entries.find(({ node }) => node.props?.onPress === env.props.onSubmit);
  assert.ok(action);
  assert.ok(!action.ancestors.includes(scroll));
  assert.equal(action.ancestors.at(-1).props.style.flexShrink, 0);
  assert.ok(action.ancestors.at(-1).props.style.paddingVertical >= 16);
  action.node.props.onPress();
  assert.deepEqual(env.calls, ['submit']);
  env.hooks.unmount();
});

test('closed vehicle forms have no keyboard listeners and release them on close or unmount', () => {
  const env = vehicleForm(); env.render(); assert.equal(env.listeners.size, 0);
  env.props.visible = true; env.render(); assert.equal(env.listeners.size, 2);
  env.render(); assert.equal(env.listeners.size, 2);
  env.listeners.get('keyboardDidShow')(); env.render();
  env.props.visible = false; env.render(); assert.equal(env.listeners.size, 0);
  env.props.visible = true; env.render(); assert.equal(env.listeners.size, 2);
  env.hooks.unmount(); assert.equal(env.listeners.size, 0);
});

test('vehicle submission locking and Android back dismissal are preserved', () => {
  const env = vehicleForm(); env.props.visible = true; env.props.submitting = true;
  let tree = env.render(); tree.props.onRequestClose(); assert.deepEqual(env.calls, []);
  assert.equal(elements(tree).find(({ node }) => node.props?.onPress === env.props.onSubmit).node.props.disabled, true);
  env.props.submitting = false; tree = env.render(); tree.props.onRequestClose();
  assert.deepEqual(env.calls, ['dismiss', 'close']); env.hooks.unmount();
});

for (const [file, footers] of [
  ['app/request/index.tsx', ['styles.footer', 'styles.offerStickyFooter']],
  ['app/publish.tsx', ['styles.fixedBottomBar']],
]) {
  test(`${file}: action footers are inside the safe screen and keyboard-avoiding area`, () => {
    const ast = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const found = new Set();
    function visit(node, ancestors = []) {
      const opening = ts.isJsxElement(node) ? node.openingElement : undefined;
      if (opening?.tagName.getText(ast) === 'View') {
        for (const footer of footers) if (opening.getText(ast).includes(footer)) {
          assert.ok(ancestors.includes('FormScreen')); assert.ok(ancestors.includes('KeyboardAvoidingView')); found.add(footer);
        }
      }
      ts.forEachChild(node, child => visit(child, opening ? [...ancestors, opening.tagName.getText(ast)] : ancestors));
    }
    visit(ast); assert.equal(found.size, footers.length);
  });
}

test('creation and update modals consistently use the protected layout', () => {
  // Wallet sheets intentionally use a screen-local overlay, not a native Modal.
  // Their safe insets and lifecycle are covered in walletSheetKeyboard.test.js.
  for (const file of [
    'features/request-detail/RequestAcceptModal.tsx', 'features/request-detail/RequestEditModal.tsx',
    'features/security/EmergencyContactFormModal.tsx', 'app/favorite-locations.tsx',
    'features/support/SupportTicketModal.tsx',
    'app/trip/manage/[id].tsx', 'components/VehicleFormModal.tsx', 'components/auth/VehicleModal.tsx',
    'components/LocationPickerModal.tsx', 'components/profile/ProfilePinModal.tsx',
    'components/profile/ProfileSubscriptionModal.tsx', 'components/PassengerArrivalPaymentCoordinator.tsx',
  ]) assert.match(read(file), /import \{ FormModal as Modal \} from '@\/components\/forms\/FormLayout'/, file);
  for (const file of ['features/trip-detail/TripEditModal.tsx', 'features/trips/TripsEditModal.tsx']) {
    assert.match(read(file), /<FormModal\s+transparent=\{Platform.OS === 'android'\}/, file);
    assert.doesNotMatch(read(file), /editModalKeyboardOffset|setEditKeyboardHeight/, file);
  }
});
