const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
function text(tree) {
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(text).join('');
  return React.isValidElement(tree) ? text(tree.props.children) : '';
}
function fixture({ platform = 'android', native = true, permission, set, get } = {}) {
  const hooks = hookHarness(), dialogs = [], writes = [];
  let user = { id: 'driver', role: 'driver' }, active = true;
  let state = permission || { optIn: false, allowed: false, notificationsAllowed: true };
  const bridge = {
    getFullScreenStatus: get || (async () => state),
    setFullScreenOptIn: async (id, enabled) => {
      writes.push([id, enabled]);
      if (set) return set(id, enabled);
      state = { ...state, optIn: enabled }; return true;
    },
  };
  const Component = loader({ react: hooks.react,
    'react-native': { View: 'View', Text: 'Text', Switch: 'Switch', TouchableOpacity: 'Button',
      Alert: { alert: (...args) => dialogs.push(args) }, Platform: { OS: platform, Version: 34 },
      NativeModules: native ? { ZwangaDriverAlerts: bridge } : {} },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/store/hooks': { useAppSelector: () => user }, '@/store/selectors': {},
    '@/utils/accountRole': { isDriverAccount: value => value.role === 'driver' },
    '@/services/rideAudioDiagnostics': { boundedRideAudio: promise => promise },
    '@/constants/styles': { Colors: { primary: 'orange', gray: { 700: 'gray', 900: 'black' } } },
  })('components/profile/DriverFullScreenPreference.tsx').DriverFullScreenPreference;
  return { hooks, writes, dialogs, render: () => hooks.render(Component),
    user: value => { user = value; }, active: value => { active = value; }, permission: value => { state = value; } };
}
async function load(f) { f.render(); await tick(); return f.render(); }

test('consent dialog is explicit, optional and does not grant native access on its own', async () => {
  const f = fixture(); let tree = await load(f);
  const toggle = nodes(tree).find(n => n.type === 'Switch');
  toggle.props.onValueChange(true); toggle.props.onValueChange(true);
  assert.equal(f.dialogs.length, 1); assert.deepEqual(f.writes, []);
  assert.match(f.dialogs[0][1], /facultative/); assert.match(f.dialogs[0][1], /bouton Retour/);
  f.dialogs[0][2][0].onPress();
  tree = f.render(); assert.equal(nodes(tree).find(n => n.type === 'Switch').props.value, false);
  toggle.props.onValueChange(true); f.dialogs[1][2][1].onPress(); await tick();
  tree = f.render(); assert.deepEqual(f.writes, [['driver', true]]);
  assert.match(text(tree), /Autorisation Android à activer/);
  assert.doesNotMatch(text(tree), /Autorisation activée\./);
  f.hooks.unmount();
});

test('return from Android settings rechecks grant, notification permission and revocation', async () => {
  const f = fixture({ permission: { optIn: true, allowed: false, notificationsAllowed: true } });
  await load(f);
  for (const state of [
    { optIn: true, allowed: true, notificationsAllowed: true },
    { optIn: true, allowed: true, notificationsAllowed: false },
    { optIn: true, allowed: false, notificationsAllowed: true },
  ]) {
    f.active(false); f.render(); f.permission(state); f.active(true);
    const tree = await load(f);
    assert.equal(text(tree).includes('Autorisation activée.'), state.allowed && state.notificationsAllowed);
    assert.equal(text(tree).includes('Les notifications sont désactivées'), !state.notificationsAllowed);
  }
  f.hooks.unmount();
});

test('disable does not reopen a permission dialog and native failure is not displayed as enabled', async () => {
  const f = fixture({ permission: { optIn: true, allowed: true, notificationsAllowed: true } });
  let tree = await load(f); nodes(tree).find(n => n.type === 'Switch').props.onValueChange(false); await tick();
  assert.equal(nodes(f.render()).find(n => n.type === 'Switch').props.value, false);
  assert.equal(f.dialogs.length, 0); f.hooks.unmount();
  const broken = fixture({ set: async () => false }); tree = await load(broken);
  nodes(tree).find(n => n.type === 'Switch').props.onValueChange(true);
  broken.dialogs[0][2][1].onPress(); await tick(); tree = broken.render();
  assert.equal(nodes(tree).find(n => n.type === 'Switch').props.value, false);
  assert.match(text(tree), /Impossible de vérifier/); broken.hooks.unmount();
});

test('iOS, old binaries, passengers and disabled builds do not present this permission', async () => {
  for (const options of [{ platform: 'ios' }, { native: false }, { get: async () => null }, { passenger: true }]) {
    const f = fixture(options);
    if (options.passenger) f.user({ id: 'passenger', role: 'passenger' });
    assert.equal(await load(f), null); assert.deepEqual(f.dialogs, []); f.hooks.unmount();
  }
});

test('a pending consent cannot act after logout, unmount or leaving the app', async () => {
  for (const leave of [f => { f.user(null); f.render(); }, f => f.hooks.unmount(), f => { f.active(false); f.render(); }]) {
    const f = fixture(); const tree = await load(f);
    nodes(tree).find(n => n.type === 'Switch').props.onValueChange(true);
    leave(f); f.dialogs[0][2][1].onPress(); await tick();
    assert.deepEqual(f.writes, []); f.hooks.unmount();
  }
});

test('deferred native call and delayed read cannot leak across driver accounts', async () => {
  const f = fixture(); const tree = await load(f);
  nodes(tree).find(n => n.type === 'Switch').props.onValueChange(true);
  f.dialogs[0][2][1].onPress(); f.user({ id: 'another-driver', role: 'driver' }); f.render(); await tick();
  assert.deepEqual(f.writes, []); f.hooks.unmount();
  let resolve;
  const delayed = fixture({ get: () => new Promise(done => { resolve = done; }) });
  delayed.render(); await tick(); delayed.user({ id: 'passenger', role: 'passenger' }); delayed.render();
  resolve({ optIn: true, allowed: true, notificationsAllowed: true }); await tick();
  assert.equal(delayed.render(), null); delayed.hooks.unmount();
});
