/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const deferred = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));

function environment(platform = 'android') {
  const hooks = hookHarness(), dialogs = [], calls = [], writes = [], links = [];
  const env = { active: true, appState: 'active', overlayBusy: false, dialogs, calls, hooks, writes, links };
  env.native = { async isAvailableAsync() { calls.push('available'); return true; },
    async requestReview() { calls.push('request'); } };
  env.load = async () => env.native;
  const react = { ...hooks.react, useContext: () => ({ isBusy: () => env.overlayBusy }), useState: initial => {
    const [value, setValue] = hooks.react.useState(initial);
    return [value, next => { writes.push(next); setValue(next); }];
  } };
  const showDialog = dialog => dialogs.push(dialog);
  const { useStoreReview } = loader({ react,
    'react-native': { Platform: { OS: platform }, AppState: { get currentState() { return env.appState; } },
      Linking: { openURL: async url => links.push(url) } },
    '@/features/navigation/rideOverlayContext': { RideOverlayContext: {} },
    '@/features/store-review/nativeReview': { loadNativeReview: () => { calls.push('load'); return env.load(); } },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => env.active },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog }) },
  })('hooks/useStoreReview.ts');
  return Object.assign(env, { render: () => hooks.render(useStoreReview) });
}

test('iOS and Android request the native dialog only on tap, without any external link or false publication claim', async () => {
  for (const platform of ['ios', 'android']) {
    const env = environment(platform);
    for (let i = 0; i < 100; i++) env.render();
    assert.deepEqual(env.calls, []);
    assert.equal(env.render().isAvailable, true);
    await env.render().openReview();
    assert.deepEqual(env.calls, ['load', 'available', 'request']);
    assert.deepEqual(env.links, []); assert.deepEqual(env.dialogs, []);
    assert.equal(env.render().isOpening, false); env.hooks.unmount();
  }
});

test('duplicate taps are ignored throughout module loading, availability and the native request', async () => {
  const env = environment(), loading = deferred(), availability = deferred(), request = deferred();
  env.load = () => loading.promise;
  env.native.isAvailableAsync = () => { env.calls.push('available'); return availability.promise; };
  env.native.requestReview = () => { env.calls.push('request'); return request.promise; };
  const pending = env.render().openReview(); void env.render().openReview();
  assert.deepEqual(env.calls, ['load']); assert.equal(env.render().isOpening, true);
  loading.resolve(env.native); await flush(); void env.render().openReview();
  assert.deepEqual(env.calls, ['load', 'available']);
  availability.resolve(true); await flush(); void env.render().openReview();
  assert.deepEqual(env.calls, ['load', 'available', 'request']);
  request.resolve(); await pending;
  assert.equal(env.render().isOpening, false); env.hooks.unmount();
});

test('web, inactive screens, native background and occupied overlays never start a native request', async () => {
  for (const change of [env => { env.active = false; }, env => { env.appState = 'background'; },
    env => { env.overlayBusy = true; }]) {
    const env = environment(); change(env); await env.render().openReview();
    assert.deepEqual(env.calls, []); assert.deepEqual(env.dialogs, []); env.hooks.unmount();
  }
  const web = environment('web');
  assert.equal(web.render().isAvailable, false); await web.render().openReview();
  assert.deepEqual(web.calls, []); web.hooks.unmount();
});

test('missing native module and unavailable native review show French information, never a URL fallback', async () => {
  for (const configure of [env => { env.load = async () => null; },
    env => { env.native.isAvailableAsync = async () => false; }]) {
    const env = environment('ios'); configure(env); await env.render().openReview();
    assert.equal(env.calls.includes('request'), false); assert.deepEqual(env.links, []);
    assert.equal(env.dialogs.length, 1); assert.equal(env.dialogs[0].title, 'Notation indisponible');
    assert.match(env.dialogs[0].message, /réessayer plus tard/);
    assert.equal(env.render().isOpening, false); env.hooks.unmount();
  }
});

test('errors release the button, allow a later tap and never display technical messages or redirect', async () => {
  for (const failAt of ['load', 'available', 'request']) {
    const env = environment();
    const fail = async () => { throw Error('TECHNICAL_DETAILS'); };
    if (failAt === 'load') env.load = fail;
    else env.native[failAt === 'available' ? 'isAvailableAsync' : 'requestReview'] = fail;
    await env.render().openReview();
    assert.equal(env.dialogs.length, 1); assert.match(env.dialogs[0].message, /Réessayez/);
    assert.equal(JSON.stringify(env.dialogs).includes('TECHNICAL_DETAILS'), false);
    assert.deepEqual(env.links, []); assert.equal(env.render().isOpening, false);
    await env.render().openReview(); assert.equal(env.dialogs.length, 2); env.hooks.unmount();
  }
});

test('leaving while loading or checking availability prevents late dialogs and native presentation', async () => {
  for (const phase of ['load', 'available']) {
    for (const leave of [env => { env.active = false; env.render(); }, env => { env.hooks.unmount(); },
      env => { env.appState = 'background'; }, env => { env.overlayBusy = true; }]) {
      const env = environment(), gate = deferred();
      if (phase === 'load') env.load = () => gate.promise;
      else env.native.isAvailableAsync = () => gate.promise;
      const pending = env.render().openReview(); await flush(); leave(env);
      gate.resolve(phase === 'load' ? env.native : true); await pending;
      assert.equal(env.calls.includes('request'), false); assert.deepEqual(env.dialogs, []);
      assert.deepEqual(env.links, []); env.hooks.unmount();
    }
  }
});

test('unmount during the native request suppresses late errors and state writes', async () => {
  const env = environment(), gate = deferred(); env.native.requestReview = () => gate.promise;
  const pending = env.render().openReview(); await flush(); env.hooks.unmount(); const count = env.writes.length;
  gate.reject(Error('late failure')); await pending;
  assert.equal(env.writes.length, count); assert.deepEqual(env.dialogs, []); assert.deepEqual(env.links, []);
});

test('blur clears the spinner without allowing overlapping requests; stale errors stay silent on return', async () => {
  const env = environment(), gate = deferred();
  env.native.requestReview = () => { env.calls.push('request'); return gate.promise; };
  const pending = env.render().openReview(); await flush(); env.active = false; env.render();
  assert.equal(env.render().isOpening, false);
  env.active = true; await env.render().openReview();
  assert.deepEqual(env.calls, ['load', 'available', 'request']);
  gate.reject(Error('old failure')); await pending; assert.deepEqual(env.dialogs, []);
  env.native.requestReview = async () => env.calls.push('request');
  await env.render().openReview(); assert.equal(env.calls.filter(value => value === 'request').length, 2);
  env.hooks.unmount();
});

test('profile action indicates an in-app review, shows accessible loading and has no external-link icon', () => {
  const state = { storeName: 'App Store', isAvailable: true, isOpening: false, openReview() {} };
  const native = { Text: 'Text', TouchableOpacity: 'Button', View: 'View', ActivityIndicator: 'Spinner',
    StyleSheet: { create: value => value, hairlineWidth: 0.5 } };
  const { ProfileStoreReviewButton } = loader({ 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/hooks/useStoreReview': { useStoreReview: () => state },
  })('components/profile/ProfileStoreReviewButton.tsx');
  let button = ProfileStoreReviewButton();
  assert.equal(button.props.accessibilityRole, 'button'); assert.equal(button.props.onPress, state.openReview);
  assert.match(button.props.accessibilityHint, /App Store.*sans quitter/);
  const children = React.Children.toArray(button.props.children);
  assert.ok(children.some(child => child.type === 'Icon' && child.props.name === 'chevron-forward'));
  assert.equal(children.some(child => child.props.name === 'open-outline'), false);
  state.isOpening = true; button = ProfileStoreReviewButton();
  assert.equal(button.props.disabled, true); assert.equal(button.props.accessibilityState.busy, true);
  assert.ok(React.Children.toArray(button.props.children).some(child => child.type === 'Spinner'));
  state.isAvailable = false; assert.equal(ProfileStoreReviewButton(), null);
});

test('Expo store metadata is preserved without reading .env; the native button does not depend on those URLs', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../app.config.js'), 'utf8');
  const sandbox = { module: { exports: {} }, process: { env: {}, cwd: () => '/virtual' },
    require: name => {
      if (name === 'dotenv') return { config() {} };
      if (name === 'fs') return { existsSync: () => false };
      if (name === 'path') return path;
      throw Error('Unexpected dependency: ' + name);
    } };
  vm.runInNewContext(source, sandbox); const expo = sandbox.module.exports.expo;
  assert.equal(expo.android.playStoreUrl, 'https://play.google.com/store/apps/details?id=' + expo.android.package);
  assert.equal(expo.ios.appStoreUrl, 'https://apps.apple.com/app/id6756211830');
  const hook = fs.readFileSync(path.resolve(__dirname, '../hooks/useStoreReview.ts'), 'utf8');
  assert.doesNotMatch(hook, /Linking|expoConfig|openStoreReview/);
});
