const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture(getState = () => ({ zwangaApi: { config: { online: true } } })) {
  const hooks = hookHarness();
  const load = loader({ react: hooks.react, '@/store/hooks': { useAppSelector: selector => selector(getState()) } });
  return { hooks, ...load('hooks/useDisplayReads.ts'), session: load('services/tokenSession.ts') };
}

test('display policy pauses offline/covered reads and resumes once with real RTK middleware', async () => {
  const calls = [];
  const api = createApi({ reducerPath: 'zwangaApi', keepUnusedDataFor: 0,
    baseQuery: async () => { calls.push(1); return { data: ['synthetic'] }; }, tagTypes: ['Read'],
    endpoints: build => ({ read: build.query({ query: () => '/synthetic', providesTags: ['Read'] }) }) });
  const store = configureStore({ reducer: { zwangaApi: api.reducer }, middleware: get => get().concat(api.middleware) });
  const env = fixture(store.getState);
  let subscription;
  const render = async active => {
    const options = env.hooks.render(() => env.displayReadOptions(env.useDisplayReadsEnabled(active), 20));
    if (options.skip) { subscription?.unsubscribe(); subscription = null; }
    else if (!subscription) {
      subscription = store.dispatch(api.endpoints.read.initiate(undefined, {
        subscriptionOptions: options, forceRefetch: options.refetchOnMountOrArgChange,
      }));
      await subscription;
    }
    return options;
  };
  try {
    await render(true); assert.equal(calls.length, 1);
    store.dispatch(api.internalActions.onOffline());
    assert.equal((await render(true)).skip, true);
    await new Promise(resolve => setTimeout(resolve, 75));
    assert.equal(calls.length, 1);
    store.dispatch(api.internalActions.onOnline());
    await render(false);
    store.dispatch(api.internalActions.onFocus()); store.dispatch(api.util.invalidateTags(['Read']));
    await flush(); assert.equal(calls.length, 1, 'masked reads stay asleep after reconnect, focus and invalidation');
    await render(true); assert.equal(calls.length, 2);
    store.dispatch(api.internalActions.onFocus()); await flush(); assert.equal(calls.length, 2);
  } finally { subscription?.unsubscribe(); store.dispatch(api.util.resetApiState()); env.hooks.unmount(); }
});

test('refetch ignores late callbacks, failures, changed query keys and logout without claiming success', async () => {
  const env = fixture(); let calls = 0, resolve;
  const fetch = () => { calls++; return new Promise(done => { resolve = done; }); };
  const render = (enabled, scope) => env.hooks.render(() => env.useDisplayRefetch(enabled, scope, fetch));
  const first = render(true, 'a');
  const pending = first(); render(false, 'a'); resolve({ data: ['private'] });
  assert.equal((await pending).data, undefined);
  assert.ok((await first()).error); assert.equal(calls, 1);
  render(true, 'b'); assert.ok((await first()).error); assert.equal(calls, 1);
  const current = render(true, 'b');
  env.session.invalidateTokenSession(); assert.ok((await current()).error); assert.equal(calls, 1);
  const afterLogin = render(true, 'b'); env.hooks.unmount();
  assert.ok((await afterLogin()).error); assert.equal(calls, 1);
});

test('offline display retains only the current query/account snapshot', () => {
  const env = fixture();
  const render = (key, value) => env.hooks.render(() => env.useDisplayReadData(key, value));
  const page = ['synthetic'];
  assert.equal(render('first', page), page);
  assert.equal(render('first', undefined), page);
  assert.equal(render('second', undefined), undefined);
  assert.equal(render('second', page), page);
  env.session.invalidateTokenSession(); assert.equal(render('second', undefined), undefined);
  env.hooks.unmount();
});
