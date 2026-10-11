const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const request = { requestId: 'request', passenger: { id: 'passenger', name: 'Passager test', phone: null },
  expiresAt: '2099-01-01', serverNow: '2098-01-01' };

function fixture(t) {
  const hooks = hookHarness(), calls = [];
  const state = { active: true, online: true, enabled: true, version: 0, requestId: 'request',
    user: { id: 'driver', role: 'driver' }, deadline: undefined, read: async () => request };
  const hook = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: state.user }, zwangaApi: { config: { online: state.online } } }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    '@/store/api/tripRequestApi': { useGetTripRequestPassengerContactMutation: () => [id => {
      calls.push(['read', id]); return { unwrap: () => state.read(), reset: () => calls.push(['reset']) };
    }] },
  })('hooks/request-detail/useRequestPassengerContact.ts').useRequestPassengerContact;
  t.after(() => hooks.unmount());
  return { state, calls, hooks, render: () => hooks.render(() => hook(state.requestId, state.enabled, state.deadline)) };
}

test('explicit contact opens a sheet with fresh data, no conversation, acceptance or automatic message', async t => {
  const f = fixture(t); f.render(); assert.deepEqual(f.calls, []);
  await f.render().open();
  assert.deepEqual(f.calls, [['read', 'request'], ['reset']]);
  assert.deepEqual(f.render().contacts, [{ id: 'passenger', name: 'Passager test', phone: null, detail: 'Discutez du prix avant d’accepter.' }]);
  assert.equal(f.render().busy, false);
  await f.render().open(); assert.equal(f.calls.length, 2, 'does not load again over an open modal');
  f.render().close(); assert.equal(f.render().contacts, null);
  await f.render().open(); assert.equal(f.calls.length, 4, 'revalidates when reopened');
});

test('same-frame double tap performs one request and pending work stays disabled', async t => {
  const f = fixture(t), wait = deferred(); f.state.read = () => wait.promise;
  const view = f.render(), a = view.open(), b = view.open();
  assert.equal(f.calls.length, 1); assert.equal(f.render().disabled, true);
  wait.resolve(request); await Promise.all([a, b]); assert.equal(f.calls.length, 2);
});

for (const interruption of ['blur', 'account', 'logout', 'request', 'disabled', 'unmount', 'offline', 'close']) {
  const interrupt = f => {
    if (interruption === 'blur') f.state.active = false;
    if (interruption === 'account') f.state.user = { id: 'other', role: 'driver' };
    if (interruption === 'logout') f.state.version++;
    if (interruption === 'request') f.state.requestId = 'other';
    if (interruption === 'disabled') f.state.enabled = false;
    if (interruption === 'offline') f.state.online = false;
    if (interruption === 'close') f.render().close();
    if (interruption === 'unmount') f.hooks.unmount(); else f.render();
  };
  test(`contact cannot open after ${interruption}`, async t => {
    const f = fixture(t), wait = deferred(); f.state.read = () => wait.promise;
    const work = f.render().open(); interrupt(f); wait.resolve(request); await work;
    assert.deepEqual(f.calls.map(c => c[0]), ['read', 'reset']);
    if (interruption !== 'unmount') assert.equal(f.render().contacts, null);
  });
  if (interruption !== 'unmount') test(`visible contact disappears on ${interruption}`, async t => {
    const f = fixture(t); await f.render().open(); assert.ok(f.render().contacts);
    interrupt(f); assert.equal(f.render().contacts, null);
  });
}

test('passenger role, self contacts, mismatched request and invalid or expired responses are rejected', async t => {
  for (const overrides of [{ passenger: { id: 'driver' } }, { passenger: null }, { requestId: 'another' },
    { expiresAt: '2000-01-01' }, { expiresAt: 'invalid' }, { serverNow: undefined }]) {
    const f = fixture(t); f.state.read = async () => ({ ...request, ...overrides });
    await f.render().open(); assert.equal(f.render().contacts, null);
    assert.match(f.render().error, /plus disponible/);
  }
  for (const key of ['active', 'online', 'enabled']) {
    const f = fixture(t); f.state[key] = false; await f.render().open(); assert.deepEqual(f.calls, []);
  }
  const f = fixture(t); f.state.user.role = 'passenger'; await f.render().open(); assert.deepEqual(f.calls, []);
});

test('server-provided phone is optional and never fabricated when withheld or malformed', async t => {
  for (const phone of [undefined, null, '', '123', '+243 999 000 111']) {
    const f = fixture(t); f.state.read = async () => ({ ...request, passenger: { ...request.passenger, phone } });
    await f.render().open(); assert.equal(f.render().contacts[0].phone, phone === '+243 999 000 111' ? phone : null);
  }
});

test('network or server access failure leaves a retryable button without a contact', async t => {
  const f = fixture(t); f.state.read = async () => { throw { status: 'FETCH_ERROR' }; };
  await f.render().open(); assert.equal(f.render().busy, false); assert.ok(f.render().error);
  assert.equal(f.render().contacts, null);
  f.state.read = async () => request; await f.render().open(); assert.ok(f.render().contacts);
});

test('a dispatch deadline is not extended by opening contact or by a slow response', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 100000 });
  const f = fixture(t), wait = deferred(); f.state.deadline = 130000; f.state.read = () => wait.promise;
  const work = f.render().open(); t.mock.timers.tick(30001); wait.resolve(request); await work;
  assert.equal(f.render().contacts, null); assert.ok(f.render().error);
  const reads = f.calls.length; await f.render().open(); assert.equal(f.calls.length, reads);
});

test('an open contact closes automatically at the dispatch deadline, with no polling', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture(t); f.state.deadline = 130000; await f.render().open(); assert.ok(f.render().contacts);
  t.mock.timers.tick(30000); assert.equal(f.render().contacts, null); assert.ok(f.render().error);
  assert.equal(f.calls.length, 2);
});

test('request expiry also closes the sheet when there is no dispatch deadline', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture(t); f.state.read = async () => ({ ...request, serverNow: new Date(100000).toISOString(), expiresAt: new Date(135000).toISOString() });
  await f.render().open(); assert.ok(f.render().contacts);
  t.mock.timers.tick(35000); assert.equal(f.render().contacts, null);
});

const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join('') : words(node?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'ScrollView', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } };

test('the request contact action mounts the existing driver contact modal, not a chat route', () => {
  const calls = [], state = { contacts: null, open: () => calls.push('open'), close: () => calls.push('close') };
  const { RequestPassengerContact } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/request-detail/useRequestPassengerContact': { useRequestPassengerContact: () => state },
    '@/features/navigation/NavigationContactModal': { NavigationContactModal: 'Contacts' },
  })('features/request-detail/RequestPassengerContact.tsx');
  const render = () => all(RequestPassengerContact({ requestId: 'request', enabled: true }));
  assert.equal(render().some(n => n.type === 'Contacts'), false);
  const button = render().find(n => n.type === 'Button'); assert.equal(words(button), 'Contacter le passager');
  button.props.onPress(); assert.deepEqual(calls, ['open']);
  state.contacts = [{ id: 'passenger', name: 'Passager test', phone: null, detail: '' }];
  const modal = render().find(n => n.type === 'Contacts');
  assert.equal(modal.props.role, 'driver'); assert.equal(modal.props.contacts, state.contacts);
  modal.props.onClose(); assert.deepEqual(calls, ['open', 'close']);
});

test('shared contact modal exposes call, WhatsApp and Zwanga and launches only the chosen channel', async t => {
  const hooks = hookHarness(), calls = [], person = { id: 'passenger', name: 'Passager test', phone: '+243999000111', detail: '' };
  const { NavigationContactModal, ContactModalContent } = loader({ react: hooks.react, 'react-native': native,
    '@react-navigation/native': { useIsFocused: () => true },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/components/forms/FormLayout': { FormModal: 'FormModal' },
    '@/utils/phoneHelpers': { openPhoneCall: async phone => calls.push(['phone', phone]), openWhatsApp: async phone => calls.push(['whatsapp', phone]) },
    '@/hooks/navigation/useTripContactMessaging': { useContactMessaging: () => ({ canMessage: true, userId: 'driver', cancel() {}, openMessage: async p => calls.push(['message', p.id]) }) },
  })('features/navigation/NavigationContactModal.tsx');
  const wrapper = NavigationContactModal({ contacts: [person], role: 'driver', onClose() {} });
  assert.equal(wrapper.type, ContactModalContent); assert.equal(wrapper.props.active, true);
  const render = () => hooks.render(() => ContactModalContent(wrapper.props));
  t.after(() => hooks.unmount());
  assert.equal(render().props.inApp, true, 'keeps the existing in-app overlay (no stacked iOS native modal)');
  assert.deepEqual(calls, []);
  for (const label of ['Appeler', 'WhatsApp', 'Message dans Zwanga']) {
    const button = all(render()).find(n => n.type === 'Button' && words(n).startsWith(label));
    assert.equal(button.props.disabled, false); button.props.onPress(); await new Promise(resolve => setImmediate(resolve));
  }
  assert.deepEqual(calls, [['phone', person.phone], ['whatsapp', person.phone], ['message', person.id]]);
  person.phone = null;
  const buttons = all(render()).filter(n => n.type === 'Button');
  for (const label of ['Appeler', 'WhatsApp']) assert.equal(buttons.find(n => words(n) === label).props.disabled, true);
  assert.equal(buttons.find(n => words(n).startsWith('Message dans Zwanga')).props.disabled, false);
});

test('explicit contact endpoint uses GET, does not poll, or mutate/invalidate trip lists', () => {
  let endpoints;
  loader({ './baseApi': { baseApi: { injectEndpoints: config => {
    endpoints = config.endpoints({ mutation: config => config, query: config => config }); return {};
  } } }, './tripApi': { mapServerTripToClient: x => x },
  '@/services/tokenSession': { getTokenSessionVersion: () => 0 },
  })('store/api/tripRequestApi.ts');
  const endpoint = endpoints.getTripRequestPassengerContact;
  assert.deepEqual(endpoint.query('request'), { url: '/trip-requests/request/passenger-contact', method: 'GET' });
  assert.equal(endpoint.invalidatesTags, undefined); assert.equal(endpoint.onQueryStarted, undefined);
});

test('server refusals never fall back to a public profile or leak an old contact', async t => {
  for (const status of [401, 403, 404, 429, 500]) {
    const f = fixture(t); f.state.read = async () => { throw { status }; };
    await f.render().open(); assert.equal(f.render().contacts, null); assert.ok(f.render().error);
    assert.deepEqual(f.calls, [['read', 'request'], ['reset']]);
  }
});

test('server remaining lifetime works with phone clock skew and conservatively counts HTTP delay', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const f = fixture(t), wait = deferred(); f.state.read = () => wait.promise;
  const work = f.render().open(); t.mock.timers.tick(5000);
  wait.resolve({ ...request, serverNow: '2026-10-08T12:00:00Z', expiresAt: '2026-10-08T12:00:30Z' });
  await work; assert.ok(f.render().contacts);
  t.mock.timers.tick(25000); assert.equal(f.render().contacts, null);
});
