const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];

function fixture(t) {
  const h = hookHarness(), saved = [];
  const io = { granted: true, permissionReads: 0, settings: 0, writeFails: false, choice: { enabled: false, chosen: false } };
  const Choice = loader({
    react: { ...React, ...h.react, useSyncExternalStore: (_subscribe, read) => read() },
    'react-native': { View: 'View', Text: 'Text', Switch: 'Switch', StyleSheet: { create: value => value }, Linking: { openSettings: async () => io.settings++ } },
    '@/services/installationAnnouncements': {
      announcementPreference: () => io.choice, subscribeAnnouncementPreference() {}, loadAnnouncementPreference: async () => {},
      setAnnouncementPreference: async enabled => { if (io.writeFails) throw Error('storage'); saved.push(enabled); io.choice = { enabled, chosen: true }; },
    },
    '@/services/pushNotifications': { ensureAndroidChannel: async () => {}, requestPushPermissions: async () => { io.permissionReads++; return io.granted; } },
  })('components/UpdateAnnouncementsChoice.tsx').UpdateAnnouncementsChoice;
  const render = () => nodes(h.render(Choice));
  t.after(() => h.unmount());
  return { io, saved, render, toggle: enabled => render().find(node => node.type === 'Switch').props.onValueChange(enabled) };
}
test('guest consent never prompts on mount; enabling asks once and disabling never prompts', async t => {
  const f = fixture(t); f.render(); await flush(); assert.equal(f.io.permissionReads, 0);
  f.toggle(true); f.toggle(true); await flush();
  assert.equal(f.io.permissionReads, 1); assert.deepEqual(f.saved, [true]);
  f.toggle(false); await flush(); assert.deepEqual(f.saved, [true, false]); assert.equal(f.io.permissionReads, 1);
});
test('denied OS permission never records consent or opens settings without an explicit tap', async t => {
  const f = fixture(t); f.io.granted = false; f.toggle(true); await flush();
  assert.deepEqual(f.saved, []); assert.equal(f.io.settings, 0);
  const tree = f.render(); assert.ok(tree.some(node => node.props.accessibilityRole === 'alert'));
  tree.find(node => node.props.accessibilityRole === 'link').props.onPress(); await flush(); assert.equal(f.io.settings, 1);
});
test('failed consent persistence shows a recoverable error and leaves the switch off', async t => {
  const f = fixture(t); f.io.writeFails = true; f.toggle(true); await flush();
  assert.deepEqual(f.saved, []); assert.equal(f.render().find(node => node.type === 'Switch').props.value, false);
  assert.ok(f.render().some(node => node.props.accessibilityRole === 'alert'));
  f.io.writeFails = false; f.toggle(true); await flush(); assert.deepEqual(f.saved, [true]);
});

test('anonymous registration uses installation credentials without account authorization or Redux secret arguments', async () => {
  let endpoint; const calls = [];
  const identity = { id: 'synthetic-installation', secret: 'synthetic-test-secret' };
  loader({
    './baseApi': { publicBaseQuery: async request => { calls.push(request); return { data: { registered: true, enabled: true } }; },
      baseApi: { injectEndpoints: value => { endpoint = value.endpoints({ mutation: x => x }).syncInstallationUpdates; return {}; } } },
    '@/services/installationAnnouncements': { getAnnouncementIdentity: async () => identity },
  })('store/api/installationUpdatesApi.ts');
  const input = { id: identity.id, sequence: 1, platform: 'android', version: '1.0.0', build: '1', enabled: true, pushToken: 'synthetic-token' };
  const result = await endpoint.queryFn(input, {}, {});
  assert.equal(result.data.registered, true);
  assert.deepEqual(calls[0].headers, { 'x-installation-secret': identity.secret });
  assert.equal(calls[0].body.secret, undefined); assert.equal(input.secret, undefined);
  assert.equal((await endpoint.queryFn({ ...input, id: 'wrong' }, {}, {})).error.status, 'CUSTOM_ERROR');
  assert.equal(calls.length, 1);
});

test('release information uses the public transport while account registration retains authenticated transport', async () => {
  let endpoints; const calls = [];
  loader({ './baseApi': {
    publicBaseQuery: async request => { calls.push(request); return { data: { enabled: true, release: null } }; },
    baseApi: { injectEndpoints: value => { endpoints = value.endpoints({ query: x => x, mutation: x => x }); return {}; } },
  } })('store/api/appUpdatesApi.ts');
  const installed = { platform: 'ios', version: '1.0', build: '1' };
  assert.deepEqual((await endpoints.getAppUpdate.queryFn(installed, {}, {})).data, { enabled: true, release: null });
  assert.equal(calls[0].headers, undefined);
  assert.equal(endpoints.registerAppUpdateClient.queryFn, undefined);
  assert.equal(endpoints.registerAppUpdateClient.query(installed).method, 'POST');
});
