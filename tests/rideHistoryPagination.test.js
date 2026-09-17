const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { readHistoryPage } = loader()('store/api/historyPage.ts');
const policy = loader()('utils/rideHistory.ts');

test('history uses a bounded page and forwards cursor/search through RTK baseQuery', async () => {
  const calls = [], read = async args => { calls.push(args); return { data: { data: [{ id: 'a' }], nextCursor: 'next' } }; };
  const result = await readHistoryPage(read, '/trips/my-trips', 'cursor', 'gombe', value => ({ ...value, mapped: true }));
  assert.deepEqual(calls, [{ url: '/trips/my-trips/history', params: { before: 'cursor', limit: 30, search: 'gombe' } }]);
  assert.deepEqual(result.data, { data: [{ id: 'a', mapped: true }], nextCursor: 'next' });
});

test('legacy fallback is first-page 404 only, preserves all matching history and does not hide errors', async () => {
  const calls = [], records = [{ id: 'a', date: '2020-01-01' }, { id: 'b', date: '2021-01-01' }];
  const read = async args => { calls.push(args); return typeof args === 'string' ? { data: records } : { error: { status: 404 } }; };
  const result = await readHistoryPage(read, '/bookings/my-bookings', null, '', value => value, () => true, value => value.date);
  assert.deepEqual(result.data.data.map(value => value.id), ['b', 'a']);
  assert.equal(result.data.nextCursor, null); assert.equal(calls.length, 2);
  for (const [status, cursor] of [[503, null], [403, null], [404, 'next']]) {
    let reads = 0;
    const response = await readHistoryPage(async () => { reads++; return { error: { status } }; }, '/trips/my-trips', cursor);
    assert.equal(response.error.status, status); assert.equal(reads, 1);
  }
});

test('historical policy never treats an ongoing accepted booking as expired and deduplicates loaded pages', () => {
  const trip = { status: 'ongoing', departureTime: '2020-01-01' };
  assert.equal(policy.isHistoricalTrip(trip), false);
  assert.equal(policy.isHistoricalBooking({ status: 'accepted', trip }), false);
  for (const status of ['completed', 'cancelled', 'expired', 'no_show', 'boarding_uncertain']) {
    assert.equal(policy.isHistoricalBooking({ status, trip }), true);
  }
  assert.equal(policy.isHistoricalTrip({ ...trip, status: 'upcoming' }), true);
  assert.equal(policy.normalizeHistorySearch('  École  '), 'ecole');
  assert.deepEqual(policy.flattenHistoryPages([{ data: [{ id: 'a' }, { id: 'b' }] }, { data: [{ id: 'b' }, { id: 'c' }] }]),
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
});

test('history feeds separate activity from pages and suspend pagination/polling outside the foreground', () => {
  const hooks = hookHarness(), reads = [];
  let active = true, more = 0;
  const activity = { data: [{ id: 'ongoing', status: 'accepted', trip: { status: 'ongoing', departureTime: '2020-01-01' } }], refetch() {} };
  const history = { currentData: { pages: [{ data: [{ id: 'old' }] }] }, hasNextPage: true, fetchNextPage() { more++; }, refetch() {} };
  const { useBookingsFeed } = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/store/api/bookingApi': {
      useGetMyActivityBookingsQuery: (_arg, options) => { reads.push(['activity', options]); return activity; },
      useGetMyBookingHistoryInfiniteQuery: (_arg, options) => { reads.push(['history', options]); return history; },
    },
  })('hooks/bookings/useBookingsFeed.ts');
  let feed = hooks.render(() => useBookingsFeed('active'));
  assert.equal(feed.displayBookings[0].id, 'ongoing'); assert.equal(reads.at(-1)[1].skip, true);
  feed.loadMore(); assert.equal(more, 0);
  feed = hooks.render(() => useBookingsFeed('history')); feed.loadMore();
  assert.equal(feed.displayBookings[0].id, 'old'); assert.equal(feed.activeBookings[0].id, 'ongoing');
  assert.equal(reads.at(-2)[1].pollingInterval, 0); assert.equal(more, 1);
  history.isFetching = true; hooks.render(() => useBookingsFeed('history')).loadMore(); assert.equal(more, 1);
  history.isFetching = false; active = false;
  hooks.render(() => useBookingsFeed('history')).loadMore();
  assert.equal(reads.at(-1)[1].skip, true); assert.equal(more, 1); hooks.unmount();
});
