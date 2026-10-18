const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const message = n => ({ id: String(n).padStart(5, '0'), conversationId: 'room',
  createdAt: new Date(Date.UTC(2026, 8, 1) + n * 1000).toISOString(), content: `Message ${n}` });

function fixture(t, count = 800) {
  const { buildMessagePages } = loader()('store/api/messages/pages.ts');
  const rows = Array.from({ length: count }, (_, i) => message(i + 1));
  const calls = [];
  let fail = false;
  const api = createApi({ reducerPath: 'testMessages', tagTypes: ['Message'],
    baseQuery: async args => {
      calls.push(args);
      if (fail) return { error: { status: 503, data: 'offline' } };
      const { before, after, limit } = args.params;
      const decode = value => Number(value.slice(7));
      const cursor = item => item ? `opaque:${Number(item.id)}` : null;
      const candidates = rows.filter(row => (!before || Number(row.id) < decode(before)) &&
        (!after || Number(row.id) > decode(after)));
      candidates.sort((a, b) => after ? Number(a.id) - Number(b.id) : Number(b.id) - Number(a.id));
      const data = candidates.slice(0, limit);
      if (after) data.reverse();
      return { data: { data, newestCursor: cursor(data[0]),
        nextCursor: after || candidates.length > limit ? cursor(data.at(-1)) : null,
        previousCursor: before || (after && candidates.length > limit) ? cursor(data[0]) : null } };
    },
    endpoints: builder => ({ ...buildMessagePages(builder),
      getConversationMessages: builder.query({ query: () => '/legacy' }) }),
  });
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer },
    middleware: getDefault => getDefault({ serializableCheck: false, immutableCheck: false }).concat(api.middleware) });
  const args = { conversationId: 'room' };
  const endpoint = api.endpoints.getConversationMessagePages;
  const state = () => endpoint.select(args)(store.getState());
  const load = options => store.dispatch(endpoint.initiate(args, { subscribe: false, ...options }));
  const { updateMessageCache } = loader({ '@/store/api/messageApi': { messageApi: api } })('store/api/messages/updateMessageCache.ts');
  t.after(() => store.dispatch(api.util.resetApiState()));
  return { rows, calls, state, load, fail: value => { fail = value; },
    receive: row => { rows.push(row); updateMessageCache(store.dispatch, 'room', { message: row }); },
    edit: row => updateMessageCache(store.dispatch, 'room', { message: row, editOnly: true }),
    remove: id => updateMessageCache(store.dispatch, 'room', { deletedId: id }),
  };
}

test('actual RTK cache keeps six pages while every older and newer message remains reachable', async t => {
  const f = fixture(t); await f.load();
  const seen = new Set();
  for (let page = 0; page < 16; page++) {
    const pages = f.state().data.pages;
    assert.ok(pages.length <= 6);
    assert.ok(pages.flatMap(p => p.data).length <= 300);
    pages.forEach(p => p.data.forEach(row => seen.add(row.id)));
    if (page < 15) await f.load({ direction: 'forward' });
  }
  assert.equal(seen.size, 800);
  for (let i = 0; i < 10; i++) await f.load({ direction: 'backward' });
  assert.equal(f.state().data.pages[0].data[0].id, message(800).id);
  assert.equal(f.state().data.pages[0].previousCursor, null);
  assert.ok(f.calls.some(call => call.params.after));
});

test('reconnect refetches one anchor instead of all six loaded pages, with older/newer access retained', async t => {
  const f = fixture(t); await f.load();
  for (let i = 0; i < 7; i++) await f.load({ direction: 'forward' });
  const anchor = f.state().data.pageParams[0];
  const calls = f.calls.length;
  await f.load({ forceRefetch: true });
  assert.equal(f.calls.length, calls + 1);
  assert.equal(f.state().data.pages.length, 1);
  assert.equal(f.calls.at(-1).params.before, anchor);
  assert.ok(f.state().data.pages[0].previousCursor);
  assert.ok(f.state().data.pages[0].nextCursor);
});

test('long live conversations automatically reload a bounded head without losing historical access', async t => {
  const f = fixture(t, 50); await f.load();
  for (let i = 51; i <= 350; i++) {
    f.receive(message(i)); await flush();
    assert.ok(f.state().data.pages[0].data.length <= 100);
  }
  const seen = new Set();
  while (true) {
    const pages = f.state().data.pages;
    pages.forEach(page => page.data.forEach(row => seen.add(row.id)));
    if (!pages.at(-1).nextCursor) break;
    await f.load({ direction: 'forward' });
  }
  assert.equal(seen.size, 350);
  assert.equal(f.rows.length, 350);
  assert.ok(f.calls.length < 20);
});

test('failed live-head refresh leaves a newer recovery cursor; edits/deletes still affect loaded rows', async t => {
  const f = fixture(t, 50); await f.load();
  for (let i = 51; i <= 100; i++) f.receive(message(i));
  f.fail(true); f.receive(message(101)); await flush();
  assert.equal(f.state().isError, true);
  assert.equal(f.state().data.pages[0].previousCursor, 'opaque:50');
  f.edit({ ...message(100), content: 'Edited' });
  assert.equal(f.state().data.pages[0].data.find(row => row.id === message(100).id).content, 'Edited');
  f.remove(message(99).id);
  assert.ok(!f.state().data.pages[0].data.some(row => row.id === message(99).id));
  f.fail(false); await f.load({ forceRefetch: true });
  assert.equal(f.state().data.pages[0].data[0].id, message(101).id);
  assert.equal(f.state().data.pages[0].previousCursor, null);
});

test('an initially empty chat also stays bounded and offers one retry after a failed head refresh', async t => {
  const f = fixture(t, 0); await f.load();
  f.fail(true);
  for (let i = 1; i <= 250; i++) { f.receive(message(i)); await flush(); }
  assert.equal(f.state().data.pages[0].data.length, 100);
  assert.equal(f.state().data.pages[0].needsHeadReload, true);
  assert.equal(f.calls.length, 2, 'no retry storm on subsequent socket events');
  f.fail(false); await f.load({ forceRefetch: true });
  assert.equal(f.state().data.pages[0].data[0].id, message(250).id);
  assert.equal(f.state().data.pages[0].needsHeadReload, undefined);
  assert.ok(f.state().data.pages[0].nextCursor);
});
