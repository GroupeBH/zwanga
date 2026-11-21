const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

test('Home prepares the same favorites/earnings caches for the correct role without history or polling', () => {
  const calls = [], favorites = {}, earnings = {};
  let online = true;
  // Query hooks are replaced by plain spies here; exercise their options without a React renderer.
  const { useHomeSupportingData: readSupportingData } = loader({
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: active => active && online },
    '@/store/api/userApi': { useGetFavoriteLocationsQuery: (args, options) => { calls.push(['favorites', args, options]); return favorites; } },
    '@/store/api/driverSettlementsApi': { useGetMyDriverSettlementQuery: (args, options) => { calls.push(['earnings', args, options]); return earnings; } },
  })('hooks/home/useHomeSupportingData.ts');
  for (const isDriver of [false, true]) {
    Object.assign(favorites, { isSuccess: false, isError: false });
    Object.assign(earnings, { isSuccess: false, isError: false });
    assert.equal(readSupportingData({ active: true, isDriver }), false);
    assert.deepEqual(calls.slice(-2), [
      ['favorites', undefined, { skip: isDriver, refetchOnMountOrArgChange: 60 }],
      ['earnings', undefined, { skip: !isDriver, refetchOnMountOrArgChange: 60 }],
    ]);
    const selected = isDriver ? earnings : favorites;
    selected.isSuccess = true;
    assert.equal(readSupportingData({ active: true, isDriver }), true);
    Object.assign(selected, { isSuccess: false, isError: true });
    assert.equal(readSupportingData({ active: true, isDriver }), true, 'inline error must not trap entry');
    for (const active of [false, true]) {
      online = !active;
      readSupportingData({ active, isDriver });
      assert.ok(calls.slice(-2).every(([, , options]) => options.skip), 'hidden/offline reads stay paused');
    }
    online = true;
  }
});
