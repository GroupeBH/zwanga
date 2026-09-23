const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const token = id => `x.${Buffer.from(JSON.stringify({ sub: id, exp: 9999999999 })).toString('base64url')}.x`;

function fixture() {
  const pending = gate(), backend = gate();
  let version = 1, cleared = 0;
  const tokens = { accessToken: token('old'), refreshToken: token('old') };
  const mod = loader({
    '../../services/tokenRefresh': { validateAndRefreshTokens: () => pending.promise },
    '../../services/tokenSession': { getTokenSessionVersion: () => version },
    '../../services/tokenStorage': {
      getTokens: async () => tokens,
      clearTokens: async expected => { if (expected !== version) return false; cleared++; return true; },
    },
    '../api/authApi': { authApi: { endpoints: { logout: { initiate: () => () => ({ unwrap: () => backend.promise, reset() {} }) } } } },
  })('store/slices/authSlice.ts');
  const store = configureStore({ reducer: mod.default });
  return { mod, store, pending, backend, cleared: () => cleared, changeAccount: () => {
    version++; store.dispatch(mod.setTokens({ accessToken: token('new'), refreshToken: token('new') }));
  } };
}

for (const outcome of [true, false]) test(`late initialization (${outcome}) cannot replace the current account`, async () => {
  const e = fixture(), work = e.store.dispatch(e.mod.initializeAuth());
  e.changeAccount(); e.pending.resolve(outcome); await work;
  assert.equal(e.store.getState().user.id, 'new');
  assert.equal(e.store.getState().isAuthenticated, true);
});

test('late logout after login cannot clear the new credentials or Redux session', async () => {
  const e = fixture(), work = e.store.dispatch(e.mod.performLogout());
  await new Promise(resolve => setImmediate(resolve));
  e.changeAccount(); e.backend.resolve({}); await work;
  assert.equal(e.cleared(), 0);
  assert.equal(e.store.getState().user.id, 'new');
  assert.equal(e.store.getState().isAuthenticated, true);
});
