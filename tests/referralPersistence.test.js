const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const policy = require('../utils/referralAttributionPolicy.js');
const tick = () => new Promise(resolve => setImmediate(resolve));
const flush = async () => { await tick(); await tick(); };
const invitation = (extra = {}) => ({ token: 'synthetic-referral-token', capturedAt: new Date().toISOString(), isDeferred: false, ...extra });

test('an offline invitation for A never attaches to B and resumes when A returns', async () => {
  const f = fixture({ online: false }); f.render(); await f.receive(invitation());
  f.state.auth.user.id = 'account-b'; f.render(); await f.reconnect();
  assert.equal(f.attachments.length, 0); assert.equal(f.resolutions.length, 0);
  assert.ok(await f.storage.getUnresolvedReferralAttribution('account-a'));
  f.state.auth.user.id = 'account-a'; f.render(); await flush();
  assert.equal(f.attachments.length, 1); f.unmount();
});

test('a resolution started for A cannot attach to B after switching accounts', async () => {
  const f = fixture(); let complete;
  f.io.resolve = () => new Promise(resolve => { complete = resolve; });
  f.render(); await flush(); await f.receive(invitation());
  f.state.auth.user.id = 'account-b'; f.render();
  complete({ referrer: { firstName: 'Test' } }); await flush();
  assert.equal(f.attachments.length, 0);
  assert.ok(await f.storage.getPendingReferralAttribution('account-a'));
  assert.deepEqual(f.routes, []); f.unmount();
});

function fixture({ disk = new Map(), role = 'driver', authenticated = true, online = true, active = true } = {}) {
  const hooks = hookHarness(), dialogs = [], routes = [], resolutions = [], attachments = [];
  const state = { auth: { isAuthenticated: authenticated, user: authenticated ? { id: 'account-a', role } : null }, zwangaApi: { config: { online } } };
  let receive;
  const io = {
    active, pathname: '/(tabs)',
    resolve: async () => ({ referrer: { firstName: 'Test' } }),
    attach: async () => ({ newlyAttached: true, referrer: { firstName: 'Test' } }),
    analytics: async () => {},
    write: async (key, value) => { disk.set(key, value); },
  };
  const showDialog = value => dialogs.push(value);
  const router = { replace: value => routes.push(value) };
  const resolve = token => ({ unwrap: async () => { resolutions.push(token); return io.resolve(token); } });
  const attach = body => ({ unwrap: async () => { attachments.push(body); return io.attach(body); } });
  const load = loader({
    react: hooks.react,
    '@react-native-async-storage/async-storage': {
      getItem: async key => disk.get(key) ?? null,
      setItem: (key, value) => io.write(key, value),
      removeItem: async key => { disk.delete(key); },
    },
    '@/hooks/useAppIsActive': { useAppIsActive: () => io.active },
    'expo-router': { useRouter: () => router, usePathname: () => io.pathname },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog }) },
    '@/services/analytics': { trackEvent: () => io.analytics() },
    '@/store/hooks': { useAppSelector: selector => selector(state) },
    '@/store/selectors': { selectIsAuthenticated: value => value.auth.isAuthenticated },
    '@/utils/errorHelpers': { getApiErrorMessage: (_error, fallback) => fallback },
    '@/utils/referralAttributionPolicy': policy,
    '@/services/chottuLinkReferral': { subscribeToChottuLinkReferrals: callback => { receive = callback; return () => {}; } },
    '@/store/api/referralApi': {
      useResolveReferralAttributionMutation: () => [resolve],
      useAttachMyReferralAttributionMutation: () => [attach],
    },
  });
  const rawStorage = load('utils/referralAttribution.ts');
  const storage = { ...rawStorage,
    getPendingReferralAttribution: (owner = state.auth.user?.id) => rawStorage.getPendingReferralAttribution(owner),
    getUnresolvedReferralAttribution: (owner = state.auth.user?.id) => rawStorage.getUnresolvedReferralAttribution(owner),
  };
  const Component = load('components/ReferralAttributionHandler.tsx').ReferralAttributionHandler;
  return {
    disk, io, state, dialogs, routes, resolutions, attachments, storage,
    render: () => hooks.render(Component), unmount: () => hooks.unmount(),
    receive: async payload => { receive(payload); await flush(); },
    reconnect: async () => {
      state.zwangaApi.config.online = false; hooks.render(Component); await flush();
      state.zwangaApi.config.online = true; hooks.render(Component); await flush();
    },
  };
}

for (const role of ['driver', 'passenger']) {
  test(`${role}: resolution failure persists before HTTP and reconnect retries without another link click`, async () => {
    const f = fixture({ role }), payload = invitation();
    f.io.resolve = async () => {
      assert.equal((await f.storage.getUnresolvedReferralAttribution()).token, payload.token);
      throw { status: 'FETCH_ERROR' };
    };
    f.render(); await flush(); await f.receive(payload);
    assert.equal(await f.storage.getPendingReferralAttribution(), null, 'signup only sees validated invitations');
    assert.equal((await f.storage.getUnresolvedReferralAttribution()).capturedAt, payload.capturedAt);
    await f.receive(payload); assert.equal(f.resolutions.length, 1, 'deduplicate native event');
    f.io.resolve = async () => ({ referrer: { firstName: 'Test' } });
    await f.reconnect();
    assert.equal(f.resolutions.length, 2);
    assert.equal(f.attachments.length, 1);
    assert.equal(f.attachments[0].referralCapturedAt, payload.capturedAt);
    assert.equal(await f.storage.getUnresolvedReferralAttribution(), null);
    assert.equal(await f.storage.getPendingReferralAttribution(), null);
    assert.deepEqual(f.routes, []);
    assert.equal(f.dialogs.at(-1).variant, 'success');
    f.unmount();
  });
}

test('offline capture survives a process restart and waits for foreground/network', async () => {
  const first = fixture({ online: false }), payload = invitation();
  first.render(); await first.receive(payload);
  assert.equal(first.resolutions.length, 0); first.unmount();
  const next = fixture({ disk: first.disk, active: false });
  next.render(); await flush(); assert.equal(next.resolutions.length, 0);
  next.io.active = true; next.render(); await flush();
  assert.equal(next.resolutions.length, 1); assert.equal(next.attachments.length, 1);
  assert.equal(next.attachments[0].referralCapturedAt, payload.capturedAt);
  next.unmount();
});

test('anonymous capture resolves without attaching, then attaches after login without restarting the auth form', async () => {
  const f = fixture({ authenticated: false, online: false });
  f.io.pathname = '/auth'; f.render(); await f.receive(invitation());
  await f.reconnect();
  assert.equal(f.attachments.length, 0); assert.deepEqual(f.routes, []);
  assert.ok(await f.storage.getPendingReferralAttribution());
  f.state.auth = { isAuthenticated: true, user: { id: 'new-driver', role: 'driver' } };
  f.render(); await flush();
  assert.equal(f.attachments.length, 1); f.unmount();
});

test('anonymous validation outside auth opens signup only once', async () => {
  const f = fixture({ authenticated: false, online: false });
  f.render(); await f.receive(invitation()); await f.reconnect();
  assert.equal(f.routes[0].pathname, '/auth');
  await f.reconnect(); assert.equal(f.routes.length, 1);
  f.unmount();
});

test('attachment network failure retains validated attribution and retries without resolving again', async () => {
  const f = fixture(); f.io.attach = async () => { throw { status: 503 }; };
  f.render(); await flush(); await f.receive(invitation());
  assert.ok(await f.storage.getPendingReferralAttribution());
  f.io.attach = async () => ({ newlyAttached: false, referrer: { firstName: 'Test' } });
  await f.reconnect();
  assert.equal(f.resolutions.length, 1); assert.equal(f.attachments.length, 2);
  assert.equal(await f.storage.getPendingReferralAttribution(), null); f.unmount();
});

test('a reconnect during the pending failed request is queued, with no concurrent requests', async () => {
  const f = fixture(); let fail;
  f.io.resolve = () => new Promise((_resolve, reject) => { fail = reject; });
  f.render(); await flush(); await f.receive(invitation());
  await f.reconnect(); assert.equal(f.resolutions.length, 1);
  f.io.resolve = async () => ({ referrer: { firstName: 'Test' } });
  fail({ status: 'FETCH_ERROR' }); await flush();
  assert.equal(f.resolutions.length, 2); assert.equal(f.attachments.length, 1); f.unmount();
});

for (const status of [400, 409, 422]) {
  test(`resolution business rejection ${status} clears candidate and does not retry`, async () => {
    const f = fixture(); f.io.resolve = async () => { throw { status }; };
    f.render(); await flush(); await f.receive(invitation()); await f.reconnect();
    assert.equal(f.resolutions.length, 1); assert.equal(f.attachments.length, 0);
    assert.equal(await f.storage.getUnresolvedReferralAttribution(), null);
    assert.equal(f.dialogs.at(-1).variant, 'warning'); f.unmount();
  });
}

for (const status of [401, 403, 404, 429, 500, 'TIMEOUT_ERROR']) {
  test(`resolution failure ${status} remains retryable`, async () => {
    const f = fixture(); f.io.resolve = async () => { throw { status }; };
    f.render(); await flush(); await f.receive(invitation()); await f.reconnect();
    assert.equal(f.resolutions.length, 2);
    assert.ok(await f.storage.getUnresolvedReferralAttribution());
    assert.equal(f.dialogs.filter(dialog => dialog.title === 'Invitation conservée').length, 1);
    f.unmount();
  });
}

test('first invitation wins while offline; retry never refreshes its expiry', async () => {
  const f = fixture({ online: false }), first = invitation(); f.render();
  await f.receive(first); await f.receive(invitation({ token: 'different-referral-token' }));
  assert.equal((await f.storage.getUnresolvedReferralAttribution()).token, first.token);
  await f.reconnect(); assert.equal(f.attachments[0].referralToken, first.token); f.unmount();
});

test('expired candidate is removed on launch instead of renewed or attached', async () => {
  const f = fixture({ online: false }); f.render(); await f.receive(invitation()); f.unmount();
  for (const [key, raw] of f.disk) {
    const value = JSON.parse(raw); value.capturedAt = new Date(Date.now() - 31 * 86400000).toISOString();
    f.disk.set(key, JSON.stringify(value));
  }
  const next = fixture({ disk: f.disk }); next.render(); await flush();
  assert.equal(next.resolutions.length, 0); assert.equal(next.attachments.length, 0);
  assert.equal(await next.storage.getUnresolvedReferralAttribution(), null); next.unmount();
});

test('consumed deferred attribution cannot silently attach a second account', async () => {
  const f = fixture(); f.render(); await flush(); await f.receive(invitation()); f.unmount();
  const next = fixture({ disk: f.disk }); next.render(); await flush();
  await next.receive(invitation({ isDeferred: true }));
  assert.equal(next.resolutions.length, 0); assert.equal(next.attachments.length, 0); next.unmount();
});

test('analytics failure cannot undo attachment or persistence', async () => {
  const f = fixture(); f.io.analytics = async () => { throw new Error('telemetry unavailable'); };
  f.render(); await flush(); await f.receive(invitation());
  assert.equal(f.attachments.length, 1); assert.equal(await f.storage.getPendingReferralAttribution(), null);
  assert.equal(f.dialogs.at(-1).variant, 'success'); f.unmount();
});

test('storage failure is not described as a saved invitation and allows an immediate new click', async () => {
  const f = fixture(), write = f.io.write, payload = invitation();
  f.io.write = async () => { throw new Error('storage unavailable'); };
  f.render(); await flush(); await f.receive(payload);
  assert.equal(f.resolutions.length, 0);
  assert.equal(f.dialogs.at(-1).title, 'Invitation non enregistrée');
  f.io.write = write; await f.receive(payload);
  assert.equal(f.attachments.length, 1); f.unmount();
});

test('unmount during resolution preserves validation but does not attach or navigate', async () => {
  const f = fixture(); let finish;
  f.io.resolve = () => new Promise(resolve => { finish = resolve; });
  f.render(); await flush(); await f.receive(invitation()); f.unmount();
  finish({ referrer: { firstName: 'Test' } }); await flush();
  assert.equal(f.attachments.length, 0); assert.deepEqual(f.routes, []);
  assert.ok(await f.storage.getPendingReferralAttribution());
  const next = fixture({ disk: f.disk }); next.render(); await flush();
  assert.equal(next.resolutions.length, 0); assert.equal(next.attachments.length, 1); next.unmount();
});

test('attachment business rejection is consumed once, without overriding the server', async () => {
  const f = fixture(); f.io.attach = async () => { throw { status: 409 }; };
  f.render(); await flush(); await f.receive(invitation()); await f.reconnect();
  assert.equal(f.attachments.length, 1);
  assert.equal(await f.storage.getPendingReferralAttribution(), null);
  assert.equal(f.dialogs.at(-1).variant, 'warning'); f.unmount();
});
