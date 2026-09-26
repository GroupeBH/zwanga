const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore } = require('@reduxjs/toolkit');
const { loader } = require('./helpers/loadTypeScript.cjs');
const fs = require('node:fs');
const path = require('node:path');
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const load = loader({ '@react-native-async-storage/async-storage': {} });
const { isDriverAccount } = load('utils/accountRole.ts');
const { mapServerUser } = load('store/api/user/profileMapper.ts');

test('one role predicate ignores flags, verification and vehicle ownership', () => {
  for (const role of ['passenger', 'admin', 'super_admin', undefined]) {
    const user = { id: 'a', role, isDriver: true, vehicles: [{ id: 'v' }], kycDocuments: [{ status: 'approved' }] };
    assert.equal(isDriverAccount(user), false);
    assert.equal(mapServerUser(user).isDriver, false);
    assert.equal(mapServerUser(user).identityVerified, true);
  }
  for (const role of ['driver', 'both']) {
    assert.equal(isDriverAccount({ role, isDriver: false }), true);
    assert.equal(mapServerUser({ id: 'a', role, isDriver: false }).isDriver, true);
  }
  assert.equal(isDriverAccount(null), false);
});

function roleSyncFixture() {
  let version = 0;
  const pending = gate(), actions = [];
  const state = { auth: { user: { id: 'a', role: 'passenger' } } };
  const { syncAccountRole } = loader({ '@/services/tokenSession': { getTokenSessionVersion: () => version } })('store/api/user/syncAccountRole.ts');
  return { state, actions, resolve: pending.resolve, changeSession() { version++; },
    start: () => syncAccountRole(undefined, { getState: () => state, dispatch: a => actions.push(a), queryFulfilled: pending.promise }) };
}

test('confirmed profile and activation responses sync role without replacing unrelated profile fields', async () => {
  for (const wrapped of [false, true]) {
    const f = roleSyncFixture(), work = f.start();
    const user = { id: 'a', role: 'driver', isDriver: false, name: 'Do not merge', driverActivatedAt: '2026-09-24T10:00:00Z' };
    f.resolve({ data: wrapped ? { user } : user }); await work;
    assert.equal(f.actions.length, 1);
    assert.equal(f.actions[0].payload.isDriver, true);
    assert.equal(f.actions[0].payload.role, 'driver');
    assert.equal(f.actions[0].payload.name, undefined);
  }
});

test('late role reads never resurrect a logout, affect another account or undo a newer profile', async () => {
  for (const change of [
    f => { f.state.auth.user = null; },
    f => { f.state.auth.user = { id: 'b', role: 'passenger' }; },
    f => f.changeSession(),
    f => { f.state.auth.user.updatedAt = '2026-09-24T12:00:00+01:00'; },
  ]) {
    const f = roleSyncFixture(), work = f.start(); change(f);
    f.resolve({ data: { id: 'a', role: 'driver', updatedAt: '2026-09-24T10:00:00Z' } });
    await work; assert.deepEqual(f.actions, []);
  }
});

function authFixture() {
  const mod = loader({
    '../../services/tokenRefresh': {}, '../../services/tokenStorage': {},
    '../../services/tokenSession': { getTokenSessionVersion: () => 0 },
  })('store/slices/authSlice.ts');
  return { ...mod, store: configureStore({ reducer: mod.default }) };
}
const token = payload => `x.${Buffer.from(JSON.stringify({ exp: 9999999999, ...payload })).toString('base64url')}.x`;

test('Redux never infers a driver from isDriver or merges a different account profile', () => {
  const f = authFixture();
  f.store.dispatch(f.setUser({ id: 'a', role: 'passenger', isDriver: true }));
  assert.equal(f.store.getState().user.isDriver, false);
  f.store.dispatch(f.updateUser({ id: 'b', role: 'driver' }));
  assert.equal(f.store.getState().user.role, 'passenger');
  f.store.dispatch(f.updateUser({ id: 'a', isDriver: true }));
  assert.equal(f.store.getState().user.isDriver, false);
  f.store.dispatch(f.updateUser({ id: 'a', role: 'driver' }));
  assert.equal(f.store.getState().user.isDriver, true);
  f.store.dispatch(f.updateUser({ updatedAt: '2026-09-24T12:00:00Z' }));
  f.store.dispatch(f.updateUser({ id: 'a', role: 'passenger', updatedAt: '2026-09-24T11:00:00Z' }));
  assert.equal(f.store.getState().user.role, 'driver');
});

test('a stale signup token cannot revert server-confirmed activation, but another account is isolated', () => {
  const f = authFixture(), activatedAt = '2026-09-24T10:00:00Z';
  f.store.dispatch(f.setUser({ id: 'a', role: 'driver', driverActivatedAt: activatedAt }));
  const accessToken = token({ sub: 'a', role: 'passenger', iat: Date.parse(activatedAt) / 1000 - 1 });
  f.store.dispatch(f.setTokens({ accessToken, refreshToken: 'refresh' }));
  assert.equal(f.store.getState().user.role, 'driver');
  f.store.dispatch(f.setTokens({ accessToken: token({ sub: 'b', role: 'passenger', iat: 0 }), refreshToken: 'next' }));
  assert.equal(f.store.getState().user.role, 'passenger');
  assert.equal(f.store.getState().user.driverActivatedAt, undefined);
});

test('registration sends only explicit role intent and editing profile cannot change it', () => {
  const read = filename => fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
  assert.doesNotMatch(read('hooks/auth/useRegistrationActions.ts'), /append\(['"]isDriver|isDriver:/);
  assert.doesNotMatch(read('app/edit-profile.tsx'), /append\(['"]role/);
  assert.doesNotMatch(read('app/edit-profile.tsx'), /role: updated.role/);
  assert.match(read('store/api/user/getProfileSummary.endpoints.ts'), /\/users\/driver-onboarding/);
  assert.match(read('store/api/user/getProfileSummary.endpoints.ts'), /\/users\/driver-activation/);
});
