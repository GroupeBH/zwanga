const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = t => t == null || typeof t === 'boolean' ? [] : Array.isArray(t) ? t.flatMap(nodes) : [t, ...nodes(t.props?.children)];

function fixture(t, os) {
  const h = hookHarness(), calls = [], state = { user: { id: 'synthetic' }, version: 1 };
  const flow = { loaded: true, permission: false, enabled: true, busy: false, loadError: false,
    retry: () => calls.push('retry'), setConsent: value => calls.push(['consent', value]),
    authorize: () => calls.push('authorize'), openSettings: () => calls.push('settings'), defer: () => calls.push('defer') };
  const recovery = { issue: null, error: '', busy: false, recover: () => calls.push('foreground') };
  const Banner = loader({ react: h.react,
    'react-native': { Platform: { OS: os }, StyleSheet: { create: x => x }, View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/store/hooks': { useAppSelector: fn => fn(state) }, '@/store/selectors': { selectUser: s => s.user },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    '@/hooks/location-picker/useLocationRecovery': { useLocationRecovery: (_ready, active, observe) => {
      assert.equal(observe, true); state.observationActive = active; return recovery;
    } },
    '@/hooks/profile/useNearbyLocationPermission': { useNearbyLocationPermission: options => { state.options = options; return flow; } },
    './BackgroundLocationApproval': { BackgroundLocationApproval: 'Approval' },
  })('components/location/LocationAccessBanner.tsx').LocationAccessBanner;
  const render = (props = { active: true, background: 'ride' }) => {
    const element = Banner(props); return element && h.render(() => element.type(element.props));
  };
  t.after(() => h.unmount());
  return { state, calls, flow, recovery, render, wrapper: Banner };
}

for (const os of ['android', 'ios']) test(`${os}: missing background grant is visible, consent is explicit and one modal closes after actual grant`, t => {
  const f = fixture(t, os), tree = () => nodes(f.render());
  assert.ok(tree().includes('Activer le suivi en veille')); assert.deepEqual(f.calls, []);
  assert.equal(f.state.options.driver, false, 'ride permission never enables driver discovery');
  assert.equal(f.state.options.purpose, 'passenger-trip');
  tree().find(n => n.type === 'Button').props.onPress();
  let modal = tree().find(n => n.type === 'Approval'); assert.equal(modal.props.visible, true);
  modal.props.onConfirm(); assert.deepEqual(f.calls, [['consent', true], 'authorize']);
  f.flow.settingsRequired = true; modal = tree().find(n => n.type === 'Approval'); modal.props.onConfirm();
  assert.deepEqual(f.calls.slice(-2), [['consent', true], 'settings']);
  f.flow.busy = true; assert.equal(tree().find(n => n.type === 'Button').props.disabled, true);
  const count = f.calls.length; tree().find(n => n.type === 'Approval').props.onConfirm(); assert.equal(f.calls.length, count);
  f.flow.busy = false; f.flow.permission = true; f.render(); assert.equal(f.render(), null);
});

test('GPS/foreground problems take priority; reading, inactivity and closing never start tracking', t => {
  const f = fixture(t, 'android'); f.recovery.issue = 'services';
  const tree = nodes(f.render()); assert.ok(tree.includes('Activer la localisation'));
  tree.find(n => n.type === 'Button').props.onPress(); assert.deepEqual(f.calls, ['foreground']);
  assert.equal(tree.find(n => n.type === 'Approval').props.visible, false);
  f.render({ active: false, background: 'ride' }); assert.equal(f.state.options.active, false);
  assert.equal(f.state.observationActive, false);
  f.recovery.issue = null; nodes(f.render()).find(n => n.type === 'Button').props.onPress();
  nodes(f.render()).find(n => n.type === 'Approval').props.onClose();
  assert.equal(f.calls.at(-1), 'defer'); assert.equal(nodes(f.render()).find(n => n.type === 'Approval').props.visible, false);
});

test('account/session/role changes reset the permission UI; normal passengers do not request background access', t => {
  const f = fixture(t, 'ios'), props = { active: true };
  assert.equal(f.render(props), null); assert.equal(f.state.options.active, false);
  const key = f.wrapper(props).key; f.state.version++; assert.notEqual(f.wrapper(props).key, key);
  f.state.user = null; assert.equal(f.wrapper(props), null);
  f.state.user = { id: 'another' }; f.render({ active: true, background: 'discovery' });
  assert.equal(f.state.options.driver, true); assert.equal(f.state.options.purpose, 'nearby-driver');
});
