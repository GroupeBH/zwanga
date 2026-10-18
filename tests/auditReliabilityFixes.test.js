const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : React.isValidElement(node)
  ? [node, ...nodes(node.props.children)] : [];
const words = node => Array.isArray(node) ? node.map(words).join(' ') : React.isValidElement(node)
  ? words(node.props.children) : typeof node === 'string' ? node : '';
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', FlatList: 'List',
  ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } };
const animation = { duration: () => animation };
const ui = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/utils/reanimated': { __esModule: true, default: { View: 'AnimatedView' }, FadeIn: animation, FadeInDown: animation },
  '@/features/navigation/RideModal': { RideModal: 'SharedModal' } };

function feedFixture(t) {
  const hooks = hookHarness(), options = {}, calls = [];
  const state = { active: true, online: true, tab: 'active' };
  const activity = { data: [{ id: 'active', status: 'accepted' }], refetch: () => calls.push('activity') };
  const history = { data: { pages: [{ data: [{ id: 'old', status: 'completed' }] }] },
    hasNextPage: true, refetch: () => calls.push('history'), fetchNextPage: () => calls.push('next') };
  const { useBookingsFeed } = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/store/hooks': { useAppSelector: select => select({ zwangaApi: { config: { online: state.online } } }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => 0 },
    '@/store/api/bookingApi': {
      useGetMyActivityBookingsQuery: (_, value) => { options.activity = value; return activity; },
      useGetMyBookingHistoryInfiniteQuery: (_, value) => { options.history = value; return history; },
    },
  })('hooks/bookings/useBookingsFeed.ts');
  t.after(() => hooks.unmount());
  return { state, options, activity, history, calls, render: () => hooks.render(() => useBookingsFeed(state.tab)) };
}

test('bookings use the shared activity discovery without another polling loop', t => {
  const f = feedFixture(t), feed = f.render();
  assert.equal(f.options.activity.skip, false);
  assert.equal(f.options.activity.pollingInterval, 0);
  assert.equal(f.options.activity.refetchOnFocus, false);
  assert.equal(f.options.activity.refetchOnReconnect, false);
  assert.equal(f.options.history.skip, true);
  assert.equal(feed.activeBookings.length, 1);
  feed.refetch(); assert.deepEqual(f.calls, ['activity']);
  f.state.tab = 'history'; f.render().loadMore();
  assert.equal(f.options.activity.skip, true);
  assert.equal(f.options.history.skip, false);
  assert.equal(f.options.history.refetchOnMountOrArgChange, true);
  assert.deepEqual(f.calls, ['activity', 'next']);
});

for (const pause of ['offline', 'hidden']) test(`booking reads stop when ${pause}, cached history stays visible`, t => {
  const f = feedFixture(t); f.state.tab = 'history'; f.render();
  if (pause === 'offline') f.state.online = false; else f.state.active = false;
  const feed = f.render();
  assert.equal(f.options.activity.skip, true); assert.equal(f.options.history.skip, true);
  assert.deepEqual(feed.displayBookings.map(row => row.id), ['old']);
  feed.refetch(); feed.loadMore(); assert.deepEqual(f.calls, []);
  f.state.active = true; f.state.online = true; f.render().refetch();
  assert.deepEqual(f.calls, ['history']);
});

test('review API bounds each page and keeps legacy consumers intact', () => {
  const builder = { query: definition => definition, mutation: definition => definition };
  const { reviewApi: api } = loader({ './baseApi': { baseApi: { injectEndpoints: options => options.endpoints(builder) } } })('store/api/reviewApi.ts');
  assert.deepEqual(api.getReviewPage.query({ userId: 'user' }), {
    url: '/ratings/user/user/page', params: { before: undefined, limit: 20 },
  });
  assert.deepEqual(api.getReviewPage.query({ userId: 'user', limit: 3, before: 'cursor' }).params,
    { before: 'cursor', limit: 3 });
  const result = api.getReviewPage.transformResponse({ total: 42, nextCursor: 'next', data: [
    { id: 'review', rating: '4.5', ratedUserId: 'user', raterId: 'rater', createdAt: '2026-01-01', rater: { firstName: 'Test', lastName: 'Avis' } },
  ] });
  assert.equal(result.total, 42); assert.equal(result.nextCursor, 'next');
  assert.equal(result.data[0].rating, 4.5); assert.equal(result.data[0].fromUserName, 'Test Avis');
  assert.equal(api.getReviewPage.keepUnusedDataFor, 30);
  assert.equal(api.getReviews.query('user'), '/ratings/user/user');
  assert.deepEqual(api.getReviewPage.providesTags(null, null, { userId: 'user' }), [{ type: 'User', id: 'user' }]);
  assert.deepEqual(api.getAverageRating.providesTags(null, null, 'user'), [{ type: 'User', id: 'user' }]);
});

function reviewFixture(t) {
  const hooks = hookHarness(), calls = [];
  const state = { active: true, online: true, version: 0, data: { data: [{ id: 'first' }], total: 21, nextCursor: 'next' } };
  const props = { userId: 'user', reviewsModalVisible: true, setReviewsModalVisible() {}, insets: { bottom: 0 } };
  const { ProfileReviewsModal } = loader({ ...ui, react: { ...React, ...hooks.react },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/store/hooks': { useAppSelector: select => select({ zwangaApi: { config: { online: state.online } } }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    '@/store/api/reviewApi': { useGetReviewPageQuery: (args, options) => {
      calls.push({ args, options }); return { currentData: state.data, isError: state.error,
        isFetching: state.fetching, refetch: async () => { calls.push('retry'); return { data: state.data }; } };
    } },
    '@/components/ui/HistoryPagination': { HistoryPagination: 'Pagination' },
    './ProfileReviewItem': { ProfileReviewItem: 'Review' },
  })('components/profile/ProfileReviewsModal.tsx');
  t.after(() => hooks.unmount());
  const render = () => hooks.render(() => ProfileReviewsModal(props));
  const list = tree => nodes(tree).find(n => n.type === 'List');
  return { state, props, calls, render, list };
}

test('review sheet virtualizes a bounded page and never mixes two cursor pages', t => {
  const f = reviewFixture(t), tree = f.render(), list = f.list(tree);
  assert.equal(tree.props.inApp, true); assert.equal(tree.type, 'SharedModal');
  assert.equal(f.calls.at(-1).args.limit, 20);
  assert.equal(list.props.initialNumToRender, 6); assert.equal(list.props.windowSize, 3);
  list.props.ListFooterComponent.props.onNext(); f.state.data = undefined; f.state.fetching = true;
  const next = f.list(f.render());
  assert.equal(f.calls.at(-1).args.before, 'next');
  assert.deepEqual(next.props.data, []); assert.match(words(next.props.ListEmptyComponent), /Chargement/);
  f.state.data = { data: [{ id: 'last' }], total: 21, nextCursor: null }; f.state.fetching = false;
  const loaded = f.list(f.render());
  assert.deepEqual(loaded.props.data.map(row => row.id), ['last']);
  assert.equal(loaded.props.ListFooterComponent.props.page, 2);
  assert.equal(loaded.props.ListFooterComponent.props.hasNext, false);
});

test('review sheet preserves the current page offline, blocks retry, and clears it on account change', async t => {
  const f = reviewFixture(t); f.render(); f.state.online = false; f.state.data = undefined;
  const offline = f.list(f.render());
  assert.equal(f.calls.at(-1).options.skip, true);
  assert.deepEqual(offline.props.data.map(row => row.id), ['first']);
  assert.equal(offline.props.ListFooterComponent.props.busy, true);
  await offline.props.ListFooterComponent.props.onRetry();
  assert.ok(!f.calls.includes('retry'));
  f.props.userId = 'other'; f.state.version++;
  assert.deepEqual(f.list(f.render()).props.data, []);
  assert.equal(f.calls.at(-1).args.before, undefined);
  f.state.active = false;
  assert.equal(f.render().props.visible, false);
});

test('review errors are not displayed as an empty review history', t => {
  const f = reviewFixture(t); f.state.data = undefined; f.state.error = true;
  const list = f.list(f.render());
  assert.match(words(list.props.ListEmptyComponent), /Avis indisponibles/);
  assert.equal(list.props.ListFooterComponent.props.error, true);
});

test('a request result shows success only with a confirmed identifier and uses the shared overlay', () => {
  const { RequestSuccessModal } = loader(ui)('components/trip-request/RequestSuccessModal.tsx');
  const props = { insets: { top: 0, bottom: 0 }, isRequestSuccessVisible: true };
  for (const [id, resolving, title] of [[null, true, 'Vérification en cours'], [null, false, 'Envoi non confirmé'], ['request', false, 'Commande envoyée']]) {
    const tree = RequestSuccessModal({ ...props, createdRequestId: id, isResolvingSentRequest: resolving });
    assert.equal(tree.type, 'SharedModal'); assert.equal(tree.props.inApp, true);
    assert.ok(words(tree).includes(title));
    assert.equal(nodes(tree).some(n => n.type === 'Icon' && n.props.name === 'checkmark'), Boolean(id));
    if (!id) assert.ok(!words(tree).includes('Commande envoyée'));
    if (!id && !resolving) assert.ok(words(tree).includes('Voir mes commandes'));
  }
});

test('request recovery rejects near matches and duplicates instead of confirming the wrong order', async () => {
  const { recoverRequest } = loader({ '@/constants/network': { MUTATION_RECONCILIATION_DELAYS_MS: [0] } })('features/trip-request/recoverRequest.ts');
  const attempt = { startedAt: Date.parse('2026-01-01'), departure: 'a', arrival: 'b',
    departureDateMin: '2026-01-02T08:00:00Z', departureDateMax: '2026-01-02T09:00:00Z', seats: 2, price: 2000, vehicleType: 'car' };
  const row = { id: 'confirmed', createdAt: '2026-01-01', departure: { name: 'A' }, arrival: { name: 'B' },
    departureDateMin: attempt.departureDateMin, departureDateMax: attempt.departureDateMax,
    numberOfSeats: 2, maxPricePerSeat: 2000, vehicleType: 'car' };
  for (const change of [{ departureDateMin: '2026-01-02T08:30:00Z' }, { numberOfSeats: 1 },
    { maxPricePerSeat: 1000 }, { vehicleType: 'motorcycle_2_wheels' }, { createdAt: '2025-01-01' }]) {
    assert.equal(await recoverRequest(attempt, async () => [{ ...row, ...change }], () => true), null);
  }
  assert.equal(await recoverRequest(attempt, async () => [row, { ...row, id: 'other' }], () => true), null);
  assert.equal(await recoverRequest(attempt, async () => [row], () => true), 'confirmed');
});
