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
const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(words).join('')
  : React.isValidElement(tree) ? words(tree.props.children) : '';
const button = (tree, label) => nodes(tree).find(node => node.type === 'Button' && (!label || words(node) === label));
const checkbox = tree => nodes(tree).find(node => node.type === 'Consent');
function fixture({ enabled = true, granted = false, role = 'driver', available = true, initialError = false,
  foreground = true, canAskAgain = true, os = 'android' } = {}) {
  const hooks = hookHarness(), calls = [];
  let user = { id: 'driver', role }, version = 0, delay, result = true, active = true;
  let foregroundResult = true, settingsError = false, started = true, saveDelay;
  let requestCanAskAgain = canAskAgain;
  const appState = { currentState: 'active' };
  const component = loader({
    react: hooks.react,
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
      AppState: appState, Platform: { OS: os }, StyleSheet: { create: value => value },
      Linking: { openSettings: async () => { calls.push('settings'); if (settingsError) throw new Error('settings'); } } },
    '@/components/location/BackgroundLocationConsent': { BackgroundLocationConsent: 'Consent' },
    '@/services/nearbyDriverLocationHealth': {
      getNearbyDriverLocationHealth: () => ({ lastSentAt: null }),
      subscribeNearbyDriverHealth: () => () => {},
    },
    '@/store/hooks': { useAppSelector: selector => selector({ auth: { user } }) },
    '@/store/selectors': { selectUser: state => state.auth.user },
    '@/utils/accountRole': { isDriverAccount: value => value?.role === 'driver' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
    'expo-location': {
      getForegroundPermissionsAsync: async () => ({ granted: foreground, canAskAgain }),
      getBackgroundPermissionsAsync: async () => {
        if (initialError) { initialError = false; throw new Error('temporary native error'); }
        return { granted, canAskAgain };
      },
      requestForegroundPermissionsAsync: async () => {
        calls.push('foreground'); foreground = foregroundResult; return { granted: foreground, canAskAgain };
      },
      requestBackgroundPermissionsAsync: async () => {
        calls.push('permission'); if (delay) await delay; granted = result; canAskAgain = requestCanAskAgain;
        return { granted, canAskAgain };
      },
    },
    '@/services/nearbyDriverLocation': {
      isNearbyDriverLocationEnabled: async () => enabled,
      setNearbyDriverLocationEnabled: async (_id, value) => {
        calls.push(value ? 'enable' : 'disable'); if (saveDelay) await saveDelay; enabled = value;
      },
      ensureNearbyDriverLocation: async () => { calls.push('start'); return started; },
    },
  })('components/profile/NearbyDriverLocationPermission.tsx').NearbyDriverLocationPermission;
  return { hooks, calls, render: () => hooks.render(() => component({ available })),
    delay: value => { delay = value; }, deny: () => { result = false; requestCanAskAgain = false; },
    switchAccount: () => { version++; user = { id: 'next', role }; },
    loseRole: () => { user = { ...user, role: 'passenger' }; },
    setActive: value => { active = value; appState.currentState = value ? 'active' : 'background'; },
    grant: () => { granted = true; foreground = true; },
    unavailable: () => { available = false; }, failSettings: () => { settingsError = true; },
    denyForeground: () => { foregroundResult = false; },
    failStart: () => { started = false; },
    delaySave: value => { saveDelay = value; },
    revoke: () => { granted = false; canAskAgain = false; },
  };
}

test('disclosure requires an unchecked consent choice then explicit validation before the OS prompt', async () => {
  const f = fixture(); f.render(); await tick(); const tree = f.render();
  assert.match(words(tree), /toutes les 3 minutes/);
  assert.match(words(tree), /écran est éteint/); assert.match(words(tree), /serveur/);
  assert.deepEqual(f.calls, []); assert.equal(checkbox(tree).props.checked, false);
  assert.equal(button(tree).props.disabled, true);
  button(tree).props.onPress(); await tick(); assert.deepEqual(f.calls, []);
  checkbox(tree).props.onChange(true); const selected = f.render();
  assert.equal(button(selected).props.disabled, false); assert.deepEqual(f.calls, []);
  button(selected).props.onPress(); await tick();
  assert.deepEqual(f.calls, ['permission', 'enable', 'start']);
  assert.match(words(f.render()), /Autorisé sur ce téléphone/);
  assert.equal(checkbox(f.render()), undefined); f.hooks.unmount();
});

test('a transient initial permission error offers an enabled retry and recovers without leaving the screen', async () => {
  const f = fixture({ initialError: true, granted: true }); f.render(); await tick();
  let tree = f.render();
  assert.match(words(tree), /Impossible de vérifier les autorisations/);
  assert.doesNotMatch(words(tree), /Vérification des autorisations…/);
  const button = nodes(tree).find(node => node.type === 'Button' && words(node) === 'Réessayer');
  assert.notEqual(button.props.disabled, true); button.props.onPress();
  f.render(); await tick(); tree = f.render();
  assert.match(words(tree), /Autorisé sur ce téléphone/); assert.deepEqual(f.calls, []);
  f.hooks.unmount();
});

test('already granted OS permission shows default automatic mode without another activation button', async () => {
  const f = fixture({ granted: true }); f.render(); await tick();
  assert.deepEqual(f.calls, []);
  assert.match(words(f.render()), /Autorisé sur ce téléphone/);
  const button = nodes(f.render()).find(node => node.type === 'Button');
  assert.match(words(button), /Désactiver/); button.props.onPress(); await tick();
  assert.deepEqual(f.calls, ['disable']); f.hooks.unmount();
});

test('denied permission leaves foreground discovery available without saving consent', async () => {
  const f = fixture(); f.deny(); f.render(); await tick();
  checkbox(f.render()).props.onChange(true);
  nodes(f.render()).find(node => node.type === 'Button').props.onPress(); await tick();
  assert.deepEqual(f.calls, ['permission']); assert.match(words(f.render()), /demandes restent accessibles/);
  assert.doesNotMatch(words(f.render()), /Autorisé sur ce téléphone/);
  assert.ok(button(f.render(), 'Ouvrir les réglages'));
  f.hooks.unmount();
});

test('passengers cannot enable driver GPS; a disabled server still allows revocation', async () => {
  const passenger = fixture({ role: 'passenger' }); assert.equal(passenger.render(), null); passenger.hooks.unmount();
  const f = fixture({ granted: true, available: false }); f.render(); await tick();
  const button = nodes(f.render()).find(node => node.type === 'Button');
  assert.equal(button.props.disabled, false); button.props.onPress(); await tick();
  assert.deepEqual(f.calls, ['disable']); f.hooks.unmount();
});

test('a disabled account can explicitly re-enable when OS permission is already granted', async () => {
  const f = fixture({ enabled: false, granted: true }); f.render(); await tick();
  assert.match(words(f.render()), /Vous avez désactivé/);
  checkbox(f.render()).props.onChange(true);
  nodes(f.render()).find(node => node.type === 'Button').props.onPress(); await tick();
  assert.deepEqual(f.calls, ['enable', 'start']); f.hooks.unmount();
});

test('deferring without system permission does not persist an opt-out or open a prompt', async () => {
  const f = fixture(); f.render(); await tick();
  nodes(f.render()).find(node => node.type === 'Button' && /Pas maintenant/.test(words(node)))
    .props.onPress(); await tick();
  assert.deepEqual(f.calls, []); assert.match(words(f.render()), /Vous pouvez continuer/); f.hooks.unmount();
});

test('double taps and an account change during permission cannot start old-account tracking', async () => {
  const f = fixture(); let resolve; f.delay(new Promise(done => { resolve = done; }));
  f.render(); await tick(); checkbox(f.render()).props.onChange(true);
  const button = nodes(f.render()).find(node => node.type === 'Button');
  button.props.onPress(); button.props.onPress(); await tick();
  assert.deepEqual(f.calls, ['permission']);
  f.switchAccount(); f.render(); resolve(); await tick();
  assert.deepEqual(f.calls, ['permission']); f.hooks.unmount();
});

test('foreground permission precedes background and refusing it does not ask for background', async () => {
  const f = fixture({ foreground: false }); f.denyForeground(); f.render(); await tick();
  checkbox(f.render()).props.onChange(true); button(f.render()).props.onPress(); await tick();
  assert.deepEqual(f.calls, ['foreground']); assert.doesNotMatch(words(f.render()), /Autorisé sur ce téléphone/);
  f.hooks.unmount();
  const g = fixture({ foreground: false }); g.render(); await tick();
  checkbox(g.render()).props.onChange(true); button(g.render()).props.onPress(); await tick();
  assert.deepEqual(g.calls, ['foreground', 'permission', 'enable', 'start']); g.hooks.unmount();
});

test('settings shortcut requires consent; actual grants on return re-enable a previously opted-out driver', async () => {
  const f = fixture({ enabled: false, canAskAgain: false }); f.render(); await tick();
  assert.equal(button(f.render(), 'Ouvrir les réglages').props.disabled, true);
  checkbox(f.render()).props.onChange(true); button(f.render()).props.onPress(); await tick();
  assert.deepEqual(f.calls, ['settings']);
  // Merely opening Settings must not save consent or claim permission.
  f.render(); await tick(); assert.deepEqual(f.calls, ['settings']);
  assert.doesNotMatch(words(f.render()), /Autorisé sur ce téléphone/);
  f.setActive(false); f.render(); f.grant(); f.setActive(true); f.render(); await tick();
  assert.deepEqual(f.calls, ['settings', 'enable', 'start']);
  assert.match(words(f.render()), /Autorisé sur ce téléphone/); f.hooks.unmount();
});

test('returning from settings without permission remains optional and never starts tracking', async () => {
  const f = fixture({ canAskAgain: false }); f.render(); await tick();
  checkbox(f.render()).props.onChange(true); button(f.render()).props.onPress(); await tick();
  f.setActive(false); f.render(); f.setActive(true); f.render(); await tick();
  assert.deepEqual(f.calls, ['settings']); assert.match(words(f.render()), /Pas encore autorisé/);
  button(f.render(), 'Pas maintenant').props.onPress(); await tick();
  assert.deepEqual(f.calls, ['settings']); f.hooks.unmount();
});

test('settings launch failure permits retry and a new account never inherits the consent', async () => {
  const f = fixture({ canAskAgain: false }); f.failSettings(); f.render(); await tick();
  checkbox(f.render()).props.onChange(true); button(f.render()).props.onPress(); await tick();
  assert.match(words(f.render()), /Impossible de terminer/);
  assert.equal(button(f.render()).props.disabled, false);
  f.switchAccount(); const next = f.render();
  assert.doesNotMatch(words(next), /Autorisé sur ce téléphone/);
  await tick(); assert.equal(checkbox(f.render()).props.checked, false);
  assert.equal(button(f.render()).props.disabled, true); f.hooks.unmount();
});

test('unchecking or opting out cancels the activation pending from settings', async () => {
  for (const action of ['uncheck', 'disable']) {
    const f = fixture({ enabled: action === 'disable', canAskAgain: false }); f.render(); await tick();
    checkbox(f.render()).props.onChange(true); button(f.render()).props.onPress(); await tick();
    if (action === 'uncheck') checkbox(f.render()).props.onChange(false);
    else { button(f.render(), 'Pas maintenant').props.onPress(); await tick(); }
    f.setActive(false); f.render(); f.grant(); f.setActive(true); f.render(); await tick();
    assert.equal(f.calls.includes('enable'), false); assert.equal(f.calls.includes('start'), false);
    f.hooks.unmount();
  }
});

test('no permission or activation is requested while the service is unavailable or the screen inactive', async () => {
  for (const mode of ['unavailable', 'inactive']) {
    const f = fixture(); f.render(); await tick();
    checkbox(f.render()).props.onChange(true);
    if (mode === 'unavailable') f.unavailable(); else f.setActive(false);
    button(f.render()).props.onPress(); await tick();
    assert.deepEqual(f.calls, []); f.hooks.unmount();
  }
});

test('permission success is not advertised as a running or delivered GPS update', async () => {
  const f = fixture(); f.failStart(); f.render(); await tick();
  checkbox(f.render()).props.onChange(true); button(f.render()).props.onPress(); await tick();
  const tree = f.render();
  assert.match(words(tree), /Autorisé sur ce téléphone/);
  assert.match(words(tree), /L’envoi n’a pas encore démarré/);
  assert.doesNotMatch(words(tree), /Position envoyée/); f.hooks.unmount();
});

test('role loss or unmount during a prompt cannot activate tracking afterwards', async () => {
  for (const change of ['role', 'unmount']) {
    const f = fixture(); let resolve; f.delay(new Promise(done => { resolve = done; }));
    f.render(); await tick(); checkbox(f.render()).props.onChange(true);
    button(f.render()).props.onPress(); await tick();
    if (change === 'role') { f.loseRole(); assert.equal(f.render(), null); } else f.hooks.unmount();
    resolve(); await tick(); assert.deepEqual(f.calls, ['permission']); f.hooks.unmount();
  }
});

test('system guidance uses the platform label without a false pre-checked consent', async () => {
  const f = fixture({ os: 'ios' }); f.render(); await tick();
  assert.match(words(f.render()), /« Toujours »/);
  assert.equal(checkbox(f.render()).props.checked, false); f.hooks.unmount();
});

test('revoking the OS grant in settings removes the authorized status on return', async () => {
  const f = fixture({ granted: true }); f.render(); await tick();
  assert.match(words(f.render()), /Autorisé sur ce téléphone/);
  f.setActive(false); f.render(); f.revoke(); f.setActive(true); f.render(); await tick();
  const tree = f.render(); assert.doesNotMatch(words(tree), /Autorisé sur ce téléphone/);
  assert.equal(checkbox(tree).props.checked, false);
  assert.ok(button(tree, 'Ouvrir les réglages')); assert.deepEqual(f.calls, []); f.hooks.unmount();
});

test('returning during an unresolved native prompt still finishes once without a stuck loader', async () => {
  const f = fixture(); let resolve; f.delay(new Promise(done => { resolve = done; }));
  f.render(); await tick(); checkbox(f.render()).props.onChange(true);
  button(f.render()).props.onPress(); await tick();
  f.setActive(false); f.render(); f.setActive(true); f.render(); await tick();
  resolve(); await tick(); f.render(); await tick();
  assert.deepEqual(f.calls, ['permission', 'enable', 'start']);
  assert.equal(button(f.render()).props.disabled, false);
  assert.match(words(f.render()), /Autorisé sur ce téléphone/); f.hooks.unmount();
});

test('a second foreground return during the settings save releases the loader and does not double-activate', async () => {
  const f = fixture({ enabled: false, canAskAgain: false }); let resolve;
  f.delaySave(new Promise(done => { resolve = done; }));
  f.render(); await tick(); checkbox(f.render()).props.onChange(true);
  button(f.render()).props.onPress(); await tick();
  f.setActive(false); f.render(); f.grant(); f.setActive(true); f.render(); await tick();
  assert.deepEqual(f.calls, ['settings', 'enable']);
  f.setActive(false); f.render(); f.setActive(true); f.render();
  resolve(); await tick(); f.render(); await tick();
  assert.deepEqual(f.calls, ['settings', 'enable', 'start']);
  assert.equal(button(f.render()).props.disabled, false);
  assert.match(words(f.render()), /Autorisé sur ce téléphone/); f.hooks.unmount();
});
