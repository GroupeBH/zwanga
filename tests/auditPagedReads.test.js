const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('request pages use bounded endpoints and preserve cursor/total independently of hydration', () => {
  const { buildRequestPageEndpoints } = loader({
    './requestMapper': { mapServerTripRequestToClient: r => ({ id: r.id, client: true }),
      mapServerDriverOfferWithTripRequestToClient: r => ({ id: r.id, client: true }) },
  })('store/api/trip-request/pageEndpoints.ts');
  const endpoints = buildRequestPageEndpoints({ query: definition => definition });
  for (const [name, path] of [['getAvailableRequestPage', 'available'], ['getMyRequestPage', 'my-requests'], ['getMyOfferPage', 'my-offers']]) {
    const endpoint = endpoints[name];
    assert.deepEqual(endpoint.query({ before: 'cursor' }), { url: `/trip-requests/pages/${path}`, params: { before: 'cursor', limit: 20 } });
    const page = endpoint.transformResponse({ data: [{ id: 'row' }], total: 250, nextCursor: 'next' });
    assert.deepEqual(page, { data: [{ id: 'row', client: true }], total: 250, nextCursor: 'next' });
    assert.equal(endpoint.keepUnusedDataFor, 30); assert.equal(endpoint.providesTags.length, 1);
    assert.deepEqual(endpoint.transformResponse({ data: [], total: 250, nextCursor: 'next' }).data, []);
  }
});

test('public reviews page forward/back without accumulating rows or leaking another profile/offline session', t => {
  const hooks = hookHarness(), calls = [];
  const state = { online: true, userId: 'profile-a', session: 0, data: { data: [{ id: 'first' }], total: 120, nextCursor: 'next' } };
  const { usePublicReviewPage } = loader({ react: hooks.react,
    '@/store/hooks': { useAppSelector: selector => selector({ zwangaApi: { config: { online: state.online } } }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.session },
    '@/store/api/reviewApi': { useGetReviewPageQuery: (args, options) => {
      calls.push({ args, options }); return { currentData: state.data, refetch: async () => ({ data: state.data }) };
    } },
  })('hooks/usePublicReviewPage.ts');
  t.after(() => hooks.unmount());
  const render = () => hooks.render(() => usePublicReviewPage(state.userId, true));
  assert.equal(render().total, 120); assert.equal(calls.at(-1).args.limit, 20);
  render().pagination.onNext(); state.data = { data: [{ id: 'second' }], total: 120, nextCursor: null };
  assert.deepEqual(render().reviews.map(r => r.id), ['second']);
  assert.equal(render().pagination.page, 2); assert.equal(calls.at(-1).args.before, 'next');
  render().pagination.onPrevious(); state.data = undefined;
  assert.equal(render().pagination.page, 1); assert.equal(render().reviews, undefined, 'previous page is not replaced with second-page data');
  state.data = { data: [{ id: 'first' }], total: 120, nextCursor: 'next' }; render();
  state.online = false; state.data = undefined;
  assert.deepEqual(render().reviews.map(r => r.id), ['first']); assert.equal(calls.at(-1).options.skip, true);
  state.userId = 'profile-b'; assert.equal(render().reviews, undefined);
  state.data = { data: [{ id: 'new' }], total: 1 }; render(); state.data = undefined; state.session++;
  assert.equal(render().reviews, undefined, 'logout/account change drops retained presentation data');
});
