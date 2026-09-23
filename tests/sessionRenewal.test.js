const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const jwt = (user, expired = false) => `x.${Buffer.from(JSON.stringify({sub:user,exp: Math.floor(Date.now()/1000)+(expired ? -60 : 3600)})).toString('base64url')}.x`;

function environment(options = {}) {
  const disk = new Map(), actions = [], requests = [];
  const load = loader({
    'expo-constants': { expoConfig: {} },
    'expo-secure-store': {
      getItemAsync: async key => disk.get(key) ?? null,
      setItemAsync: async (key, value) => { await options.beforeWrite?.(key); disk.set(key, value); },
      deleteItemAsync: async key => { disk.delete(key); },
    },
    '../store/api/authRefreshApi': { authRefreshApi: { endpoints: { refreshSession: { initiate: body => ({type:'refresh',body}) } } } },
    '../store/storeAccessor': { getStoreDispatch: () => action => {
      actions.push(action); if (action.type !== 'refresh') return;
      const pending = deferred(); requests.push(pending);
      return {unwrap:()=>pending.promise, reset(){}};
    } },
  });
  return { disk, actions, requests, load, storage: load('services/tokenStorage.ts'),
    session: load('services/tokenSession.ts'), api: load('services/tokenRefresh.ts') };
}

for (const method of ['validateAndRefreshTokens', 'proactiveTokenRefresh']) {
  for (const status of ['FETCH_ERROR', 'TIMEOUT_ERROR', 502, 503]) {
    test(`${method}: ${status} preserves offline context, never sends an expired access token`, async () => {
      const e = environment(); await e.storage.storeTokens(jwt('a',true),jwt('a'));
      const work = e.api[method](); await flush(); e.requests[0].reject({status});
      assert.equal(await work, true);
      assert.equal(await e.api.getValidAccessToken(),null);
      assert.equal(await e.api.hasRecoverableSession(),true,'GPS context remains eligible without an HTTP bearer');
      assert((await e.storage.getTokens()).refreshToken);
      assert(!e.actions.some(a=>a.type==='auth/logout'));
      assert.equal(await e.api[method](),true); assert.equal(e.requests.length,1, 'retry cooldown');
    });
  }
}

test('invalid/expired refresh credentials still revoke the session', async () => {
  const e=environment(); await e.storage.storeTokens(jwt('a'),jwt('a',true));
  assert.equal(await e.api.proactiveTokenRefresh(),false);
  assert.equal((await e.storage.getTokens()).accessToken,null); assert.equal(e.requests.length,0);
  assert.equal(await e.api.hasRecoverableSession(),false);
});

for (const status of [400,401,403]) test(`a current HTTP ${status} rejection clears the session`, async () => {
  const e=environment(); await e.storage.storeTokens(jwt('a',true),jwt('a'));
  const work=e.api.proactiveTokenRefresh(); await flush(); e.requests[0].reject({status}); await work;
  assert.equal((await e.storage.getTokens()).accessToken,null);
  assert(e.actions.some(a=>a.type==='auth/logout'));
});

for (const reply of ['success','rejected']) test(`late refresh ${reply} cannot modify another account`, async () => {
  const e=environment(); const old=jwt('a'); await e.storage.storeTokens(jwt('a',true),old);
  const work=e.api.refreshAccessToken(old); await flush();
  await e.storage.clearTokens(); await e.storage.storeTokens(jwt('b'),jwt('b'));
  if(reply==='success') e.requests[0].resolve({accessToken:jwt('a'),refreshToken:old});
  else e.requests[0].reject({status:401});
  assert.equal(await work,null);
  assert.equal((await e.storage.getTokens()).accessToken,jwt('b'));
  assert(!e.actions.some(a=>a.type==='auth/logout'||a.type==='auth/setTokens'));
});

test('logout during the secure write cannot resurrect credentials on disk or Redux', async () => {
  let gate; const e=environment({beforeWrite:()=>gate?.promise}); const token=jwt('a');
  await e.storage.storeTokens(jwt('a',true),token);
  const work=e.api.refreshAccessToken(token); await flush(); gate=deferred();
  e.requests[0].resolve({accessToken:token,refreshToken:token}); await flush();
  const logout=e.storage.clearTokens(); gate.resolve(); await logout; await work;
  assert.equal(e.disk.size,0); assert.equal((await e.storage.getTokens()).accessToken,null);
  assert(!e.actions.some(a=>a.type==='auth/setTokens'));
});

test('new login is not overwritten by a secure write already in progress', async () => {
  let gate; const e=environment({beforeWrite:()=>gate?.promise}); const old=jwt('a');
  await e.storage.storeTokens(jwt('a',true),old);
  const work=e.api.refreshAccessToken(old); await flush(); gate=deferred();
  e.requests[0].resolve({accessToken:old,refreshToken:old}); await flush();
  const login=e.storage.storeTokens(jwt('b'),jwt('b')); gate.resolve(); await login; await work;
  assert.equal(e.disk.get('zwanga_accessToken'),jwt('b'));
  assert(!e.actions.some(a=>a.type==='auth/setTokens'));
});

test('parallel refresh calls share one RTK mutation', async () => {
  const e=environment(); const token=jwt('a'); await e.storage.storeTokens(jwt('a',true),token);
  const a=e.api.refreshAccessToken(token), b=e.api.refreshAccessToken(token); await flush();
  assert.equal(e.requests.length,1); e.requests[0].resolve({accessToken:token,refreshToken:token});
  assert.deepEqual(await Promise.all([a,b]),[token,token]);
  assert.equal(e.actions.filter(a=>a.type==='auth/setTokens').length,1);
});

test('a Redux-only logout invalidates a pending refresh', async () => {
  const e=environment(); const token=jwt('a'); await e.storage.storeTokens(jwt('a',true),token);
  const work=e.api.refreshAccessToken(token); await flush(); e.session.invalidateTokenSession();
  e.requests[0].resolve({accessToken:token,refreshToken:token}); assert.equal(await work,null);
  assert(!e.actions.some(a=>a.type==='auth/setTokens'));
});

test('a failed native write cannot release the queue while its sibling is still pending', async () => {
  const pending=deferred();
  const e=environment({beforeWrite:key=>key.endsWith('accessToken') ? Promise.reject(Error('native failure')) : pending.promise});
  const login=e.storage.storeTokens(jwt('a'),jwt('a')).catch(()=>false); await flush();
  const logout=e.storage.clearTokens(); await flush();
  pending.resolve(); await login; await logout;
  assert.equal(e.disk.size,0); assert.equal(await e.api.hasRecoverableSession(),false);
});
