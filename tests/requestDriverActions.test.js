const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : React.isValidElement(node)
  ? [node, ...nodes(node.props.children)] : [];
const native = Object.fromEntries(['View', 'Text', 'Pressable', 'ActivityIndicator'].map(type => [type, type]));
native.StyleSheet = { create: value => value };
const request = { id: 'request', passengerId: 'owner', status: 'driver_selected', selectedDriverId: 'driver',
  tripId: 'trip', selectedAt: '2026-10-30T12:00:00.000Z', updatedAt: '2026-10-30T12:00:00.000Z' };
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(kind) {
  const hooks = hookHarness(), calls = [], routes = [], cache = [];
  let version = 1, dialog, resolve, reject;
  const mutation = body => { calls.push(body); return { unwrap: () => new Promise((ok, fail) => { resolve = ok; reject = fail; }) }; };
  const api = { util: { upsertQueryData: (endpoint, id, data) => ({ endpoint, id, data }), invalidateTags: tags => ({ tags }) } };
  const module = loader({ react: { ...React, ...hooks.react }, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { useRouter: () => ({ replace: route => routes.push(route) }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => { dialog = value; } }) },
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { id: 'owner' } } }), useAppDispatch: () => action => { cache.push(action); return Promise.resolve(); } },
    '@/store/api/requestDriverApi': { useChangeRequestDriverMutation: () => [mutation, { isLoading: false }],
      useTargetRequestMapDriverMutation: () => [mutation, { isLoading: false }] },
    '@/store/api/tripRequestApi': { tripRequestApi: api },
    '@/hooks/useDisplayReads': { displayReadOptions: enabled => ({ skip: !enabled }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
    '@/utils/errorHelpers': { getApiErrorMessage: (_error, fallback) => fallback },
  })(`features/request-detail/${kind}.tsx`);
  return { hooks, calls, routes, cache, component: module[kind], dialog: () => dialog,
    changeSession: () => { version++; }, resolve: value => resolve(value), reject: () => reject(new Error('offline')) };
}

test('change driver confirms once, prevents double requests, caches the response and opens the request map', async t => {
  const app = fixture('ChangeRequestDriverButton'); t.after(() => app.hooks.unmount());
  const tree = app.hooks.render(() => app.component({ request }));
  nodes(tree).find(n => n.type === 'Pressable').props.onPress();
  assert.equal(app.calls.length, 0);
  const accept = app.dialog().actions[1].onPress;
  const pending = accept(); accept();
  assert.equal(app.calls.length, 1);
  app.resolve({ ...request, status: 'pending', selectedDriverId: null, tripId: null }); await pending;
  assert.deepEqual(app.calls[0], { id: 'request', selectedDriverId: 'driver', selectedAt: request.selectedAt });
  assert.equal(app.cache[0].data.status, 'pending');
  assert.deepEqual(app.routes, [{ pathname: '/request/[id]', params: { id: 'request' } }]);
});

test('an old confirmation cannot cancel a newer driver selection', async t => {
  const app = fixture('ChangeRequestDriverButton'); t.after(() => app.hooks.unmount());
  nodes(app.hooks.render(() => app.component({ request }))).find(n => n.type === 'Pressable').props.onPress();
  app.hooks.render(() => app.component({ request: { ...request, selectedAt: '2026-10-30T12:01:00Z' } }));
  await app.dialog().actions[1].onPress();
  assert.equal(app.calls.length, 0);
});

test('pickup driver change uses the navigation screen safe map-release callback', async t => {
  const app = fixture('ChangeRequestDriverButton'); t.after(() => app.hooks.unmount());
  const changed = [];
  nodes(app.hooks.render(() => app.component({ request, onChanged: id => changed.push(id) })))
    .find(n => n.type === 'Pressable').props.onPress();
  const pending = app.dialog().actions[1].onPress();
  app.resolve({ ...request, status: 'pending', selectedDriverId: null, tripId: null }); await pending;
  assert.deepEqual(changed, [request.id]);
  assert.deepEqual(app.routes, [], 'no direct stack replacement while the navigation map is mounted');
});

test('a response from a previous account cannot update cache or redirect', async t => {
  const app = fixture('ChangeRequestDriverButton'); t.after(() => app.hooks.unmount());
  nodes(app.hooks.render(() => app.component({ request }))).find(n => n.type === 'Pressable').props.onPress();
  const pending = app.dialog().actions[1].onPress(); app.changeSession();
  app.resolve(request); await pending;
  assert.equal(app.cache.length, 0); assert.equal(app.routes.length, 0);
});

test('map selection explains the deadline, sends no driver identity and guards double taps', async t => {
  const app = fixture('MapDriverSelection'); t.after(() => app.hooks.unmount());
  let closed = false;
  const props = { request: { ...request, status: 'pending', selectedDriverId: null, tripId: null }, disabled: false,
    vehicle: { id: 'a'.repeat(64), vehicleType: 'car', ageMs: 0 }, onClose: () => { closed = true; } };
  const tree = app.hooks.render(() => app.component(props));
  assert.ok(nodes(tree).some(n => n.type === 'Text' && String(n.props.children).includes('3 minutes')));
  const send = nodes(tree).filter(n => n.type === 'Pressable')[1]; send.props.onPress(); send.props.onPress();
  assert.equal(app.calls.length, 1);
  assert.deepEqual(Object.keys(app.calls[0]).sort(), ['expectedUpdatedAt', 'id', 'markerId']);
  app.reject(); await flush();
  assert.equal(closed, false);
  assert.ok(nodes(app.hooks.render(() => app.component(props))).some(n => n.type === 'Text' && String(n.props.children).includes('Envoi non confirmé')));
});
