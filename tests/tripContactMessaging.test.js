const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const person = { id: 'driver', name: 'Conducteur de test', phone: null, detail: 'Votre conducteur', bookingId: 'booking' };
const conversation = { id: 'conversation', participants: [{ userId: 'passenger' }, { userId: 'driver' }] };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function fixture(t, options = {}) {
  const hooks = hookHarness();
  const calls = [];
  const state = { userId: 'passenger', active: true, version: 0, contacts: [person], conversations: [],
    list: async () => ({ data: [], meta: { page: 1, limit: 50, total: 0 } }),
    create: async () => conversation, resolve: async () => conversation, ...options };
  const { useTripContactMessaging } = loader({ react: hooks.react,
    'react-native': { Platform: { OS: 'android' }, StyleSheet: { create: x => x } },
    'react-native-maps': { PROVIDER_GOOGLE: 'google' }, '@expo/vector-icons': { Ionicons: {} },
    '@/store/hooks': { useAppSelector: selector => selector({ auth: { user: state.userId ? { id: state.userId } : null } }) },
    '@/store/selectors': { selectConversations: () => state.conversations },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    '@react-navigation/native': { useIsFocused: () => state.active },
    'expo-router': { useRouter: () => ({ push: route => calls.push(['push', route]) }) },
    '@/store/api/messageApi': {
      useCreateConversationMutation: () => [payload => { calls.push(['create', payload]); return { unwrap: () => state.create(payload) }; }],
      useResolveDirectConversationMutation: () => [payload => { calls.push(['resolve', payload]); return { unwrap: () => state.resolve(payload) }; }],
    },
  })('hooks/navigation/useTripContactMessaging.ts');
  const render = () => hooks.render(() => useTripContactMessaging(state.contacts, () => calls.push(['close'])));
  t.after(() => hooks.unmount());
  return { state, render, calls, hooks };
}

test('booking contact asks the server to reuse the exact booking conversation, with no prefetch or message sent', async t => {
  const h = fixture(t); const action = h.render();
  assert.deepEqual(h.calls, []);
  await action.openMessage(person);
  assert.deepEqual(h.calls, [
    ['create', { participantIds: ['driver'], bookingId: 'booking' }], ['close'],
    ['push', { pathname: '/chat/[id]', params: { id: 'conversation', title: person.name } }],
  ]);
  await action.openMessage(person);
  assert.equal(h.calls.length, 3, 'stays locked until navigation unmounts the modal');
});

test('driver contact uses the selected passenger and booking, including pending reservations', async t => {
  const passenger = { ...person, id: 'passenger', name: 'Passager de test' };
  const h = fixture(t, { userId: 'driver', contacts: [passenger] });
  await h.render().openMessage(passenger);
  assert.deepEqual(h.calls[0], ['create', { participantIds: ['passenger'], bookingId: 'booking' }]);
});

test('a locally known contact is resolved by the server without fetching the inbox', async t => {
  const direct = { ...person, bookingId: undefined };
  const h = fixture(t, { contacts: [direct], conversations: [conversation] });
  await h.render().openMessage(direct);
  assert.deepEqual(h.calls.map(call => call[0]), ['resolve', 'close', 'push']);
});

test('direct contacts resolve in one call regardless of inbox size and send no automatic message', async t => {
  const direct = { ...person, bookingId: undefined };
  const h = fixture(t, { contacts: [direct], list: async ({ page }) => ({
    data: page === 1 ? [{ id: 'unrelated', participants: [] }] : [conversation], meta: { page, limit: 50, total: 51 },
  }) });
  await h.render().openMessage(direct);
  assert.deepEqual(h.calls.filter(call => call[0] === 'list'), []);
  assert.deepEqual(h.calls.filter(call => call[0] === 'resolve'), [['resolve', 'driver']]);
  assert.equal(h.calls.some(call => call[0] === 'create'), false);
  const fresh = fixture(t, { contacts: [direct] });
  await fresh.render().openMessage(direct);
  assert.deepEqual(fresh.calls.find(call => call[0] === 'resolve'), ['resolve', 'driver']);
});

test('same-frame repeated taps make only one request', async t => {
  const request = deferred(); const h = fixture(t, { create: () => request.promise });
  const action = h.render(); const first = action.openMessage(person); const second = action.openMessage(person);
  assert.equal(h.calls.length, 1); request.resolve(conversation); await Promise.all([first, second]);
  assert.equal(h.calls.filter(call => call[0] === 'push').length, 1);
});

test('loading remains visible until navigation and resets after a failure or blur', async t => {
  const request = deferred(); const h = fixture(t, { create: () => request.promise });
  assert.equal(h.render().isOpeningConversation, false);
  const opening = h.render().openMessage(person);
  assert.equal(h.render().isOpeningConversation, true);
  request.resolve(conversation); await opening;
  assert.equal(h.render().isOpeningConversation, true);
  h.state.active = false;
  h.render();
  assert.equal(h.render().isOpeningConversation, false);
  h.state.active = true; h.state.create = async () => { throw new Error('offline'); };
  await assert.rejects(h.render().openMessage(person));
  assert.equal(h.render().isOpeningConversation, false);
});

for (const interruption of ['close', 'unmount', 'blur', 'account', 'logout', 'contact']) {
  test(`a late response after ${interruption} cannot redirect or reopen a contact`, async t => {
    const request = deferred(); const h = fixture(t, { create: () => request.promise });
    const action = h.render(); const opening = action.openMessage(person);
    if (interruption === 'close') action.cancel();
    if (interruption === 'unmount') h.hooks.unmount();
    if (interruption === 'blur') { h.state.active = false; h.render(); }
    if (interruption === 'account') { h.state.userId = 'someone-else'; h.render(); }
    if (interruption === 'logout') h.state.version++;
    if (interruption === 'contact') { h.state.contacts = []; h.render(); }
    request.resolve(conversation); await opening;
    assert.deepEqual(h.calls.map(call => call[0]), ['create']);
  });
}

test('closing during direct lookup prevents a subsequent create request', async t => {
  const request = deferred(); const direct = { ...person, bookingId: undefined };
  const h = fixture(t, { contacts: [direct], resolve: () => request.promise });
  const action = h.render(); const opening = action.openMessage(direct); action.cancel();
  request.resolve({ data: [], meta: { page: 1, limit: 50, total: 0 } }); await opening;
  assert.deepEqual(h.calls.map(call => call[0]), ['resolve']);
});

test('errors release the lock, leave the sheet open and expose a French retry message', async t => {
  const h = fixture(t, { create: async () => { throw new Error('SQL internal'); } });
  await assert.rejects(h.render().openMessage(person), /Impossible d’ouvrir la messagerie/);
  assert.deepEqual(h.calls.map(call => call[0]), ['create']);
  h.state.create = async () => conversation;
  await h.render().openMessage(person);
  assert.equal(h.calls.filter(call => call[0] === 'push').length, 1);
});

test('signed-out, inactive, self and stale/unlisted contacts trigger no request', async t => {
  for (const options of [{ userId: undefined }, { active: false }, { userId: person.id }, { contacts: [] }]) {
    const h = fixture(t, options); await h.render().openMessage(person); assert.deepEqual(h.calls, []);
  }
});

test('trip detail mounts the shared contact sheet only while visible and passes booking identity without requiring a phone', () => {
  const { TripContactModal } = loader({
    '@/features/navigation/NavigationContactModal': { NavigationContactModal: 'Contacts' },
  })('features/trip-detail/TripContactModal.tsx');
  const props = { contactModalVisible: true, setContactModalVisible() {}, trip: { driverId: 'driver' },
    driverPhone: null, bookingId: 'booking' };
  const sheet = TripContactModal(props);
  assert.equal(sheet.type, 'Contacts');
  assert.equal(sheet.props.contacts[0].bookingId, 'booking');
  assert.equal(sheet.props.contacts[0].phone, null);
  assert.equal(sheet.props.allowPhoneCall, false, 'detail keeps its existing WhatsApp option without adding calls');
  assert.equal(TripContactModal({ ...props, contactModalVisible: false }), null);
});
