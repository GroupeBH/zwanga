const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : React.isValidElement(tree) ? text(tree.props.children) : '';
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', StyleSheet: { create: value => value } };

test('updates checkbox starts empty and never revives a previous phone/provider choice', () => {
  const hooks = hookHarness();
  const { useSignupAnnouncements } = loader({ react: hooks.react })('hooks/auth/useSignupAnnouncements.ts');
  const render = scope => hooks.render(() => useSignupAnnouncements(scope));
  assert.equal(render('phone:first').updatesAccepted, false);
  render('phone:first').setUpdatesAccepted(true);
  assert.equal(render('phone:first').updatesAccepted, true);
  assert.equal(render('apple:second').updatesAccepted, false);
  assert.equal(render('phone:first').updatesAccepted, false);
  assert.equal(render('phone:first').updatesAccepted, false);
  render('phone:first').setUpdatesAccepted(true);
  render('phone:first').setUpdatesAccepted(false);
  assert.equal(render('phone:first').updatesAccepted, false);
  hooks.unmount();
});

test('the signup checkbox survives real React StrictMode without a render loop or inherited consent', async t => {
  const previousWindow = globalThis.window, previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const doc = { nodeType: 9, addEventListener() {}, removeEventListener() {}, activeElement: null };
  doc.defaultView = { document: doc, HTMLIFrameElement: class {} };
  const container = { nodeType: 1, tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: doc, firstChild: null, addEventListener() {}, removeEventListener() {} };
  globalThis.window = doc.defaultView; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { useSignupAnnouncements } = loader({ react: React })('hooks/auth/useSignupAnnouncements.ts');
  let snapshot, renders = 0;
  function Probe({ scope }) { snapshot = useSignupAnnouncements(scope); renders++; return null; }
  const root = createRoot(container);
  t.after(async () => { try { await React.act(async () => root.unmount()); }
    finally { globalThis.window = previousWindow; globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct; } });
  const render = scope => React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Probe, { scope }))));
  await render('signup:a'); assert.equal(snapshot.updatesAccepted, false);
  await React.act(async () => snapshot.setUpdatesAccepted(true));
  for (let i = 0; i < 30; i++) await render('signup:a');
  assert.equal(snapshot.updatesAccepted, true);
  await render('signup:b'); await render('signup:a');
  assert.equal(snapshot.updatesAccepted, false);
  assert.ok(renders < 100, `unexpected render count: ${renders}`);
});

test('checkbox and driver choices are accessible, controlled and disabled during submission', () => {
  const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } });
  const { SignupAnnouncementsCheckbox } = load('components/auth/SignupAnnouncementsCheckbox.tsx');
  const values = [];
  const tree = SignupAnnouncementsCheckbox({ checked: false, onChange: value => values.push(value) });
  assert.equal(tree.props.accessibilityRole, 'checkbox');
  assert.equal(tree.props.accessibilityState.checked, false);
  tree.props.onPress(); assert.deepEqual(values, [true]);
  assert.match(text(tree), /Me prévenir des mises à jour/);
  assert.equal(SignupAnnouncementsCheckbox({ checked: true, disabled: true }).props.disabled, true);
  const { DriverCategoryPicker } = load('components/profile/DriverCategoryPicker.tsx');
  const picker = DriverCategoryPicker({ value: 'transport', onChange: value => values.push(value) });
  const radios = nodes(picker).filter(node => node.props.accessibilityRole === 'radio');
  assert.equal(radios.length, 3);
  assert.deepEqual(radios.map(node => node.props.accessibilityState.selected), [false, true, false]);
  radios[0].props.onPress(); assert.equal(values.at(-1), 'private');
  radios[2].props.onPress(); assert.equal(values.at(-1), 'intercity');
  assert.match(text(picker), /Transport interurbain/);
  assert.match(text(picker), /Conducteur privé/); assert.match(text(picker), /Taxi \/ moto-taxi/);
  const locked = DriverCategoryPicker({ value: null, disabled: true });
  assert.ok(nodes(locked).filter(node => node.type === 'Button').every(node => node.props.disabled));
});

test('old profiles and unknown categories are never classified automatically', () => {
  const { readDriverCategory, driverCategoryLabel } = loader()('features/profile/driverCategory.ts');
  for (const value of [null, undefined, '', 'premium', 'DRIVER']) {
    assert.equal(readDriverCategory(value), null);
    assert.equal(driverCategoryLabel(value), undefined);
  }
  assert.equal(readDriverCategory('transport'), 'transport');
  assert.equal(readDriverCategory('intercity'), 'intercity');
  assert.equal(driverCategoryLabel('intercity'), 'Transport interurbain');
  assert.equal(driverCategoryLabel('private'), 'Conducteur privé');
});

test('API profile mapping retains the declared category but never grants driver rights', () => {
  const { mapServerUser } = loader({ '@react-native-async-storage/async-storage': {} })('store/api/user/profileMapper.ts');
  for (const driverCategory of ['transport', 'private', 'intercity']) {
    const pending = mapServerUser({ id: 'test', role: 'passenger', driverCategory });
    assert.equal(pending.driverCategory, driverCategory); assert.equal(pending.isDriver, false);
  }
  assert.equal(mapServerUser({ id: 'old', role: 'driver' }).driverCategory, null);
});

test('the profile indicates the declared activity without an identity verification badge', () => {
  const { ProfileHeader } = loader({ 'react-native': { ...native, Image: 'Image' }, '@expo/vector-icons': { Ionicons: 'Icon' } })('components/profile/ProfileHeader.tsx');
  const tree = ProfileHeader({ currentUser: { driverCategory: 'transport' }, isKycApproved: false,
    displaysDriverRole: true, profileRoleLabel: 'Conducteur' });
  assert.match(text(tree), /Taxi \/ moto-taxi/);
  assert.equal(nodes(tree).some(node => node.type === 'Icon' && node.props.name === 'checkmark-sharp'), false);
});
