const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi } = require('@reduxjs/toolkit/query');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function inbox(t, kind, count = 1050) {
  const notifications = kind === 'notifications', limit = notifications ? 40 : 50;
  const server = { rows: Array.from({ length: count }, (_, id) => ({ id: `synthetic-${id}`, isRead: false, unreadCount: 1 })),
    calls: [], holdMutation: null, holdRead: null, failMutation: false, failRead: false };
  const baseApi = createApi({ reducerPath: 'testApi', tagTypes: ['Notification', 'Conversation', 'Message'],
    endpoints: () => ({}), baseQuery: async arg => {
      const request = typeof arg === 'string' ? { url: arg } : arg;
      server.calls.push(request);
      if (request.method && request.method !== 'GET') {
        if (server.holdMutation) await server.holdMutation.promise;
        if (server.failMutation) return { error: { status: 403, data: 'refused' } };
        const ids = new Set(request.body?.notificationIds ?? []);
        if (request.method === 'DELETE') server.rows = server.rows.filter(row => !request.url.endsWith(`/${row.id}`));
        else if (request.url.endsWith('/disable')) server.rows = server.rows.filter(row => !ids.has(row.id));
        else for (const row of server.rows) {
          if (ids.has(row.id) || request.url.endsWith('/mark-all-as-read')) row.isRead = !request.url.endsWith('/mark-as-unread');
        }
        return { data: { updated: ids.size || server.rows.length } };
      }
      if (server.holdRead) await server.holdRead.promise;
      if (server.failRead) return { error: { status: 503, data: 'offline' } };
      const offset = notifications ? request.params.offset : (request.params.page - 1) * limit;
      const rows = structuredClone(server.rows.slice(offset, offset + limit));
      return { data: notifications ? { notifications: rows, total: server.rows.length,
        unreadCount: server.rows.filter(row => !row.isRead).length }
        : { data: rows, meta: { page: request.params.page, limit, total: server.rows.length } } };
    } });
  const load = loader({ './baseApi': { baseApi } });
  const api = notifications ? load('store/api/notificationApi.ts').notificationApi : load('store/api/messageApi.ts').messageApi;
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer },
    middleware: getDefault => getDefault({ serializableCheck: false, immutableCheck: false }).concat(api.middleware) });
  const endpoint = api.endpoints[notifications ? 'getNotificationPages' : 'listConversationPages'];
  const query = () => endpoint.select(undefined)(store.getState());
  const read = options => store.dispatch(endpoint.initiate(undefined, { subscribe: false, ...options }));
  const rows = () => query().data.pages.flatMap(page => notifications ? page.notifications : page.data);
  const mutate = (action, arg) => store.dispatch(api.endpoints[action].initiate(arg));
  const open = async () => { const subscription = store.dispatch(endpoint.initiate()); await subscription; return subscription; };
  t.after(() => store.dispatch(api.util.resetApiState()));
  return { api, store, server, limit, query, read, rows, mutate, open };
}

for (const kind of ['notifications', 'conversations']) {
  test(`${kind}: twenty pages stay bounded, and every evicted page is reachable in reverse`, async t => {
    const f = inbox(t, kind), seen = new Set(); await f.open();
    for (let page = 1; page <= 20; page++) {
      if (page > 1) await f.read({ direction: 'forward' });
      f.rows().forEach(row => seen.add(row.id));
      assert.ok(f.query().data.pages.length <= 6);
      assert.ok(f.rows().length <= 6 * f.limit);
    }
    assert.equal(seen.size, 20 * f.limit);
    assert.equal(f.query().hasPreviousPage, true);
    for (let i = 0; f.query().hasPreviousPage; i++) {
      assert.ok(i < 20); await f.read({ direction: 'backward' });
      assert.ok(f.query().data.pages.length <= 6);
    }
    assert.equal(f.rows()[0].id, 'synthetic-0');
    assert.equal(f.query().hasNextPage, true);
  });

  test(`${kind}: an acknowledged mutation rereads ONE page after twenty pages visited`, async t => {
    const f = inbox(t, kind); await f.open();
    for (let page = 1; page < 20; page++) await f.read({ direction: 'forward' });
    const anchor = f.query().data.pageParams[0], target = f.rows().at(-1).id;
    f.server.calls.length = 0;
    if (kind === 'notifications') await f.mutate('markNotificationsAsRead', { notificationIds: [target] }).unwrap();
    else await f.mutate('deleteConversation', { conversationId: target }).unwrap();
    await tick();
    assert.equal(f.server.calls.length, 2, 'one mutation plus one anchor read, never the whole historical window');
    assert.equal(f.query().data.pages.length, 1);
    assert.equal(f.query().data.pageParams[0], anchor);
    assert.equal(f.query().hasPreviousPage, true); assert.equal(f.query().hasNextPage, true);
    if (kind === 'notifications') assert.equal(f.query().data.pages[0].unreadCount, 1049);
    while (f.query().hasNextPage) await f.read({ direction: 'forward' });
    assert.equal(f.rows().some(row => row.id === target && (kind !== 'notifications' || !row.isRead)), false);
  });

  test(`${kind}: deletion waits for server acknowledgement, remains visible on refusal and reconciles on retry`, async t => {
    const f = inbox(t, kind, 120); await f.open();
    const remove = () => kind === 'notifications'
      ? f.mutate('disableNotifications', { notificationIds: ['synthetic-0'] })
      : f.mutate('deleteConversation', { conversationId: 'synthetic-0' });
    const hasTarget = () => f.rows().some(row => row.id === 'synthetic-0');
    f.server.holdMutation = deferred(); f.server.failMutation = true;
    const failed = remove(); await tick(); assert.equal(hasTarget(), true);
    f.server.holdMutation.resolve(); await failed; await tick(); assert.equal(hasTarget(), true);
    f.server.holdMutation = deferred(); f.server.failMutation = false; f.server.holdRead = deferred();
    const success = remove(); await tick(); assert.equal(hasTarget(), true);
    f.server.holdMutation.resolve(); await success; await tick();
    assert.equal(hasTarget(), false, 'confirmed row is removed while revalidation is pending');
    f.server.failRead = true; f.server.holdRead.resolve(); await tick();
    assert.equal(f.query().isError, true); assert.equal(hasTarget(), false);
    f.server.failRead = false; f.server.holdRead = null;
    await f.read({ forceRefetch: true });
    assert.equal(f.query().isError, false); assert.equal(f.rows().length, f.limit);
    assert.equal(f.rows()[0].id, 'synthetic-1');
  });

  test(`${kind}: deletions on another device leave a path back from an empty old anchor`, async t => {
    const f = inbox(t, kind, (kind === 'notifications' ? 40 : 50) * 6 + 1); await f.open();
    while (f.query().hasNextPage) await f.read({ direction: 'forward' });
    const id = f.server.rows.at(-1).id;
    f.server.rows = f.server.rows.slice(0, 1);
    // Simulates other-device deletions before a reconnect/refetch of an old offset.
    await f.read({ forceRefetch: true });
    assert.equal(f.query().hasPreviousPage, true);
    while (f.query().hasPreviousPage) await f.read({ direction: 'backward' });
    assert.equal(f.rows()[0].id, 'synthetic-0'); assert.ok(!f.rows().some(row => row.id === id));
  });
}

test('read/unread/all-read and disable reconcile notification counts from the server', async t => {
  const f = inbox(t, 'notifications', 90); await f.open();
  for (const [action, payload, unread] of [
    ['markNotificationsAsRead', { notificationIds: ['synthetic-1'] }, 89],
    ['markNotificationsAsUnread', { notificationIds: ['synthetic-1'] }, 90],
    ['markAllNotificationsAsRead', undefined, 0],
    ['disableNotifications', { notificationIds: ['synthetic-1'] }, 0],
  ]) {
    await f.mutate(action, payload); await tick();
    assert.equal(f.query().data.pages[0].unreadCount, unread);
    assert.equal(f.query().data.pages[0].total, f.server.rows.length);
    assert.deepEqual(f.rows().map(row => row.isRead), f.server.rows.slice(0, 40).map(row => row.isRead));
  }
});

test('evicting/reloading a conversation window neither clears nor doubles known unread counters', () => {
  const { default: reduce, setConversationWindow, markConversationMessagesRead, forgetConversation, resetMessages } =
    loader()('store/slices/messagesSlice.ts');
  const a = { id: 'a', unreadCount: 2 }, b = { id: 'b', unreadCount: 1 };
  let state = reduce(undefined, setConversationWindow({ conversations: [a], complete: false }));
  state = reduce(state, setConversationWindow({ conversations: [b], complete: false }));
  assert.equal(state.conversations.length, 1); assert.equal(state.unreadCount, 3);
  state = reduce(state, setConversationWindow({ conversations: [a], complete: false }));
  assert.equal(state.unreadCount, 3);
  state = reduce(state, markConversationMessagesRead('b')); assert.equal(state.unreadCount, 2);
  state = reduce(state, forgetConversation('a')); assert.equal(state.unreadCount, 0);
  assert.deepEqual(state.knownUnreadCounts, {});
  state = reduce(state, setConversationWindow({ conversations: [a, b], complete: false }));
  state = reduce(state, setConversationWindow({ conversations: [b], complete: true }));
  assert.equal(state.unreadCount, 1, 'a complete server list removes obsolete counters');
  state = reduce(state, resetMessages()); assert.deepEqual(state.knownUnreadCounts, {});
});
