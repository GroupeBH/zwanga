const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const message = (id, second) => ({ id, content: id, createdAt: `2026-09-17T10:00:${String(second).padStart(2, '0')}Z` });
const { buildMessagePages } = loader()('store/api/messages/pages.ts');
const endpoint = buildMessagePages({ infiniteQuery: value => value }).getConversationMessagePages;

test('message pages use bounded RTK reads with opaque cursors and stop at the last page', async () => {
  const calls = [], page = { data: [message('latest', 30)], nextCursor: 'cursor' };
  const result = await endpoint.queryFn({ queryArg: { conversationId: 'chat' }, pageParam: 'older-cursor' }, {}, {}, async request => {
    calls.push(request); return { data: page };
  });
  assert.equal(result.data, page);
  assert.deepEqual(calls, [{ url: '/conversations/chat/messages/page', params: { limit: 50, before: 'older-cursor' } }]);
  assert.equal(endpoint.infiniteQueryOptions.getNextPageParam(page), 'cursor');
  assert.equal(endpoint.infiniteQueryOptions.getNextPageParam({ ...page, nextCursor: null }), undefined);
});

test('old backend fallback preserves all history; errors and later-page 404 never restart full downloads', async () => {
  let calls = 0;
  const result = await endpoint.queryFn({ queryArg: { conversationId: 'chat' }, pageParam: null }, {}, {}, async () => {
    calls++;
    return calls === 1 ? { error: { status: 404 } } : { data: [message('older', 10), message('newer', 20)] };
  });
  assert.deepEqual(result.data.data.map(item => item.id), ['newer', 'older']);
  assert.equal(result.data.nextCursor, null); assert.equal(calls, 2);
  for (const [status, pageParam] of [[403, null], [503, null], [404, 'cursor']]) {
    calls = 0;
    const response = await endpoint.queryFn({ queryArg: { conversationId: 'chat' }, pageParam }, {}, {}, async () => {
      calls++; return { error: { status } };
    });
    assert.equal(response.error.status, status); assert.equal(calls, 1);
  }
});

test('message cache deduplicates echoes, edits/deletes older pages and preserves paging cursors', () => {
  const old = message('old', 10), recent = message('recent', 20), next = message('next', 30);
  const legacy = [old, recent];
  const paged = { pages: [{ data: [recent], nextCursor: 'boundary' }, { data: [old], nextCursor: null }], pageParams: [null, 'boundary'] };
  const { updateMessageCache } = loader({
    '@/store/api/messageApi': { messageApi: { util: { updateQueryData: (name, args, recipe) => {
      assert.equal(args.conversationId, 'chat');
      recipe(name === 'getConversationMessages' ? legacy : paged); return {};
    } } } },
  })('store/api/messages/updateMessageCache.ts');
  const update = change => updateMessageCache(() => {}, 'chat', change);
  update({ message: next }); update({ message: next });
  assert.deepEqual(paged.pages[0].data.map(item => item.id), ['next', 'recent']);
  update({ message: { ...old, content: 'edited' }, editOnly: true });
  assert.equal(paged.pages[1].data[0].content, 'edited');
  update({ message: message('unloaded', 0), editOnly: true });
  assert.equal(paged.pages[0].data.length, 2);
  update({ deletedId: 'old' });
  assert.equal(paged.pages[1].data.length, 0); assert.equal(legacy.length, 2);
  assert.equal(paged.pages[0].nextCursor, 'boundary');
  update({ message: message('between', 25) });
  assert.deepEqual(paged.pages[0].data.map(item => item.id), ['next', 'between', 'recent']);
});
