const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes)
  : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const button = tree => nodes(tree).find(n => n.type === 'Button');
const approval = tree => nodes(tree).find(n => n.type === 'Approval');

function fixture({ granted = false, foreground = true, enabled = true, canAskAgain = true, backgroundCanAskAgain = canAskAgain,
  initialError = false, os = 'android' } = {}) {
  const hooks = hookHarness(), calls = [], pulses = [];
  let active = true, version = 0, userId = 'driver', promptResult = true, delay;
  let requestCanAskAgain = backgroundCanAskAgain;
  const appState = { currentState: 'active' };
  const { HomeBackgroundLocationButton } = loader({
    react: hooks.react,
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
      Animated: { View: 'Halo' }, StyleSheet: { create: value => value }, Platform: { OS: os },
      AppState: appState, Linking: { openSettings: async () => { calls.push('settings'); } } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/components/location/BackgroundLocationApproval': { BackgroundLocationApproval: 'Approval' },
    '@/hooks/home/useLocationPermissionPulse': { useLocationPermissionPulse: value => { pulses.push(value); return 0.2; } },
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
    'expo-location': {
      getForegroundPermissionsAsync: async () => { calls.push('readForeground'); return { granted: foreground, canAskAgain }; },
      getBackgroundPermissionsAsync: async () => {
        calls.push('readBackground'); if (initialError) { initialError = false; throw new Error('native'); }
        return { granted, canAskAgain: backgroundCanAskAgain };
      },
      requestForegroundPermissionsAsync: async () => { calls.push('foreground'); foreground = promptResult; return { granted: foreground, canAskAgain }; },
      requestBackgroundPermissionsAsync: async () => {
        calls.push('background'); if (delay) await delay;
        granted = promptResult; backgroundCanAskAgain = requestCanAskAgain;
        return { granted, canAskAgain: backgroundCanAskAgain };
      },
    },
    '@/services/nearbyDriverLocation': {
      isNearbyDriverLocationEnabled: async () => enabled,
      setNearbyDriverLocationEnabled: async (id, value) => { calls.push(['enabled', id, value]); enabled = value; },
      ensureNearbyDriverLocation: async () => { calls.push('startGPS'); return true; },
    },
  })('components/home/HomeBackgroundLocationButton.tsx');
  return { hooks, calls, pulses,
    render: () => hooks.render(() => HomeBackgroundLocationButton({ userId, active })),
    setActive: value => { active = value; appState.currentState = value ? 'active' : 'background'; },
    grant: () => { granted = true; foreground = true; }, revoke: () => { granted = false; },
    deny: (askAgain = false) => { promptResult = false; requestCanAskAgain = askAgain; }, delay: value => { delay = value; },
    unblock: () => { canAskAgain = true; backgroundCanAskAgain = true; },
    switchAccount: () => { userId = 'next-driver'; version++; enabled = false; },
  };
}
const confirm = f => approval(f.render()).props.onConfirm();
const writes = f => f.calls.filter(c => Array.isArray(c) || ['background', 'foreground', 'settings', 'startGPS'].includes(c));

test('missing grant shows a Home action without requests or automatic dialogs; explicit confirmation grants it', async () => {
  const f = fixture({ foreground: false }); assert.equal(f.render(), null); await tick();
  const tree = f.render(); assert.equal(f.pulses.at(-1), true);
  assert.match(button(tree).props.accessibilityLabel, /Activer ma localisation/);
  assert.equal(approval(tree).props.visible, false); assert.deepEqual(writes(f), []);
  assert.equal(nodes(button(tree)).some(n => n.type === 'Text'), false, 'icon only, with accessible label');
  assert.equal(button(tree).props.style.width, 44); assert.equal(button(tree).props.style.height, 44);
  button(tree).props.onPress();
  assert.equal(approval(f.render()).props.visible, true); assert.equal(f.pulses.at(-1), false);
  assert.deepEqual(writes(f), []); await confirm(f);
  assert.deepEqual(writes(f), ['foreground', 'background', ['enabled', 'driver', true]]);
  assert.equal(f.render(), null); assert.equal(f.pulses.at(-1), false);
  // Only the existing, eligibility-aware coordinator may start GPS after authorization.
  assert.equal(f.calls.includes('startGPS'), false); f.hooks.unmount();
});

test('already authorized drivers have no prompt, animation or activation; revocation restores the action', async () => {
  const f = fixture({ granted: true }); f.render(); await tick();
  assert.equal(f.render(), null); assert.equal(f.pulses.at(-1), false); assert.deepEqual(writes(f), []);
  f.setActive(false); assert.equal(f.render(), null); f.revoke(); f.setActive(true); f.render(); await tick();
  assert.ok(button(f.render())); assert.equal(f.pulses.at(-1), true); f.hooks.unmount();
});

test('Later never disables tracking or grants permission; a denial keeps the button without reopening a prompt', async () => {
  const f = fixture(); f.render(); await tick(); button(f.render()).props.onPress();
  approval(f.render()).props.onClose(); assert.equal(approval(f.render()).props.visible, false);
  assert.deepEqual(writes(f), []); button(f.render()).props.onPress();
  f.deny(); await confirm(f); assert.deepEqual(writes(f), ['background']);
  const tree = f.render(); assert.ok(button(tree)); assert.equal(approval(tree).props.visible, true);
  assert.equal(approval(tree).props.settingsRequired, true);
  assert.match(approval(tree).props.message, /Pas encore autorisé/); f.hooks.unmount();
});

test('opening Settings is not authorization; returning with real grants hides the action without a second validation', async () => {
  const f = fixture({ canAskAgain: false, enabled: false }); f.render(); await tick();
  button(f.render()).props.onPress(); await confirm(f); assert.deepEqual(writes(f), ['settings']);
  f.setActive(false); assert.equal(f.render(), null); assert.equal(f.pulses.at(-1), false);
  f.grant(); f.setActive(true); f.render(); await tick();
  assert.equal(f.render(), null);
  assert.deepEqual(writes(f), ['settings', ['enabled', 'driver', true]]); f.hooks.unmount();
});

test('permission alone does not erase an opt-out; reactivation requires a new explicit confirmation', async () => {
  const f = fixture({ granted: true, enabled: false }); f.render(); await tick();
  button(f.render()).props.onPress(); assert.deepEqual(writes(f), []);
  assert.equal(approval(f.render()).props.permission, true); await confirm(f);
  assert.deepEqual(writes(f), [['enabled', 'driver', true]]); assert.equal(f.render(), null); f.hooks.unmount();
});

test('inactive Home stops reading/animating, and a failed native read offers retry without claiming permission', async () => {
  const f = fixture({ initialError: true }); f.setActive(false); assert.equal(f.render(), null); await tick();
  assert.deepEqual(f.calls, []); assert.equal(f.pulses.at(-1), false);
  f.setActive(true); f.render(); await tick();
  const failed = f.render(); assert.equal(button(failed).props.accessibilityLabel, 'Vérifier ma localisation');
  assert.equal(f.pulses.at(-1), false); button(failed).props.onPress();
  assert.equal(approval(f.render()).props.loadError, true); await confirm(f); f.render(); await tick();
  assert.match(button(f.render()).props.accessibilityLabel, /Activer/); assert.deepEqual(writes(f), []);
  assert.equal(approval(f.render()).props.visible, true); f.hooks.unmount();
});

test('pending native prompt blocks double acceptance and never starts old-account work after a session change', async () => {
  for (const change of ['account', 'unmount']) {
    const f = fixture(); let resolve; f.delay(new Promise(done => { resolve = done; }));
    f.render(); await tick(); button(f.render()).props.onPress();
    const pending = confirm(f); void confirm(f); await tick();
    assert.deepEqual(writes(f), ['background']); assert.equal(button(f.render()).props.disabled, true);
    assert.equal(f.pulses.at(-1), false);
    if (change === 'account') { f.switchAccount(); f.render(); } else f.hooks.unmount();
    resolve(); await pending; await tick(); assert.deepEqual(writes(f), ['background']); f.hooks.unmount();
  }
});

test('a dialog retained from another session or an inactive screen cannot authorize location', async () => {
  for (const change of ['account', 'inactive', 'unmount']) {
    const f = fixture(); f.render(); await tick(); button(f.render()).props.onPress();
    const staleConfirm = approval(f.render()).props.onConfirm;
    if (change === 'account') f.switchAccount();
    else if (change === 'inactive') f.setActive(false);
    else f.hooks.unmount();
    if (change !== 'unmount') f.render(); await staleConfirm();
    assert.deepEqual(writes(f), []); f.hooks.unmount();
  }
});

test('iOS validation uses the native request, with no driver availability query in this flow', async () => {
  // The actual component/hook are loaded with no API or store mocks: adding a
  // server prerequisite would break this test before rendering the invitation.
  const f = fixture({ os: 'ios' }); f.render(); await tick(); button(f.render()).props.onPress();
  assert.equal(approval(f.render()).props.visible, true); await confirm(f);
  assert.equal(f.render(), null); assert.equal(f.calls.includes('settings'), false); f.hooks.unmount();
});

test('a blocked background grant does not skip an available foreground prompt or open general Settings', async () => {
  const f = fixture({ foreground: false, canAskAgain: true, backgroundCanAskAgain: false }); f.render(); await tick();
  button(f.render()).props.onPress(); assert.equal(approval(f.render()).props.settingsRequired, false);
  await confirm(f); assert.deepEqual(writes(f), ['foreground']);
  assert.equal(approval(f.render()).props.settingsRequired, true);
  assert.equal(approval(f.render()).props.foregroundPermission, true);
  await confirm(f); assert.deepEqual(writes(f), ['foreground', 'settings']); f.hooks.unmount();
});

test('a fresh permission read supersedes a stale settings flag before launching any settings page', async () => {
  const f = fixture({ canAskAgain: false }); f.render(); await tick(); button(f.render()).props.onPress();
  assert.equal(approval(f.render()).props.settingsRequired, true); f.unblock(); await confirm(f);
  assert.deepEqual(writes(f), ['background', ['enabled', 'driver', true]]); f.hooks.unmount();
});

test('a requestable denial offers another native request, not a forced settings redirect', async () => {
  const f = fixture(); f.render(); await tick(); button(f.render()).props.onPress(); f.deny(true);
  await confirm(f); assert.equal(approval(f.render()).props.settingsRequired, false);
  await confirm(f); assert.deepEqual(writes(f), ['background', 'background']); f.hooks.unmount();
});

test('closing the validation without a grant keeps the invitation and performs no activation', async () => {
  const f = fixture(); f.render(); await tick(); button(f.render()).props.onPress();
  approval(f.render()).props.onClose(); const tree = f.render();
  assert.equal(approval(tree).props.visible, false); assert.equal(f.pulses.at(-1), true);
  assert.deepEqual(writes(f), []); f.hooks.unmount();
});

test('web never requests mobile background permissions or renders an unsupported action', async () => {
  const f = fixture({ os: 'web' }); assert.equal(f.render(), null); await tick();
  assert.deepEqual(f.calls, []); assert.equal(f.pulses.at(-1), false); f.hooks.unmount();
});

test('ordinary Home rerenders do not poll permissions or enqueue another native action', async () => {
  const f = fixture(); f.render(); await tick(); const reads = f.calls.length;
  for (let i = 0; i < 50; i++) f.render(); await tick();
  assert.equal(f.calls.length, reads); assert.deepEqual(writes(f), []); f.hooks.unmount();
});

function motionFixture({ reduced = false, delayed = false, fail = false } = {}) {
  const hooks = hookHarness(), calls = [], configs = [];
  let enabled = true, listener, resolve;
  const preference = delayed ? new Promise(done => { resolve = done; }) : fail ? Promise.reject(new Error('native')) : Promise.resolve(reduced);
  const { useLocationPermissionPulse } = loader({ react: hooks.react, 'react-native': {
    AccessibilityInfo: {
      addEventListener: (_event, fn) => { listener = fn; return { remove: () => calls.push('unsubscribe') }; },
      isReduceMotionEnabled: () => preference,
    },
    Animated: {
      Value: class { setValue(value) { calls.push(['value', value]); } stopAnimation() { calls.push('stopValue'); } },
      timing: (_value, config) => { configs.push(config); return config; }, sequence: value => value,
      loop: () => ({ start: () => calls.push('start'), stop: () => calls.push('stop') }),
    },
  } })('hooks/home/useLocationPermissionPulse.ts');
  return { hooks, calls, configs, render: () => hooks.render(() => useLocationPermissionPulse(enabled)),
    setEnabled: value => { enabled = value; }, changePreference: value => listener(value), resolve: value => resolve(value) };
}

test('halo is slow, native and non-interacting; disabling or unmounting stops and unsubscribes it', async () => {
  const f = motionFixture(); f.render(); assert.equal(f.calls.includes('start'), false); await tick();
  assert.equal(f.calls.filter(c => c === 'start').length, 1);
  assert.ok(f.configs.every(c => c.useNativeDriver && c.isInteraction === false && c.duration >= 1400));
  assert.deepEqual(f.configs.map(c => c.toValue), [0.85, 0.2]);
  f.setEnabled(false); f.render(); assert.ok(f.calls.includes('stop')); assert.ok(f.calls.includes('unsubscribe'));
  const count = f.calls.filter(c => c === 'start').length; f.changePreference(false);
  assert.equal(f.calls.filter(c => c === 'start').length, count); f.hooks.unmount();
});

test('reduced motion and unreadable settings keep the button static; late native replies cannot restart it', async () => {
  for (const options of [{ reduced: true }, { fail: true }]) {
    const f = motionFixture(options); f.render(); await tick(); assert.equal(f.calls.includes('start'), false); f.hooks.unmount();
  }
  const f = motionFixture({ delayed: true }); f.render(); f.changePreference(true); f.resolve(false); await tick();
  assert.equal(f.calls.includes('start'), false); f.changePreference(false); assert.ok(f.calls.includes('start'));
  f.changePreference(true); assert.ok(f.calls.includes('stop')); f.hooks.unmount();
  const g = motionFixture({ delayed: true }); g.render(); g.hooks.unmount(); g.resolve(false); await tick();
  assert.equal(g.calls.includes('start'), false);
});
