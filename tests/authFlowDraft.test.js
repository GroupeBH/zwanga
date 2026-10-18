/* global Buffer */
const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const seed = { mode: 'signup', step: 'sms', phone: '+243000000000' };

function fixture(disk = new Map(), extraMocks = {}) {
  const io = { reads: 0, writes: 0, deletes: 0, failRead: false, failWrite: false, hold: null };
  const load = loader({
    'expo-secure-store': {
      WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
      getItemAsync: async key => { io.reads++; if (io.failRead) throw Error('locked'); return disk.get(key) ?? null; },
      setItemAsync: async (key, value, options) => {
        io.writes++; if (io.failWrite) throw Error('locked');
        if (io.hold) await io.hold.promise;
        assert.equal(options.keychainAccessible, 'device-only'); disk.set(key, value);
      },
      deleteItemAsync: async key => { io.deletes++; disk.delete(key); },
    }, ...extraMocks,
  });
  return { load, io, disk, service: load('services/authFlowDraft.ts') };
}

test('a fresh JS process restores the phone OTP step, never PIN, OTP digits or reset proof', async () => {
  const e = fixture();
  await e.service.saveAuthFlowDraft({ ...seed, smsCode: ['9', '8', '7', '6', '5'], pin: '1234',
    pinConfirm: '1234', resetOtpCode: ['1'], resetNewPin: '4321', resetToken: 'secret-reset-proof', accessToken: 'session-access' });
  const persisted = [...e.disk.values()][0];
  for (const key of ['smsCode', 'pin', 'pinConfirm', 'resetOtpCode', 'resetNewPin', 'resetToken', 'accessToken']) {
    assert.equal(Object.hasOwn(JSON.parse(persisted).state, key), false, key);
  }
  const reboot = fixture(e.disk);
  assert.equal(reboot.service.getAuthDraftSnapshot(), null);
  const result = await reboot.service.restoreAuthFlowDraft();
  assert.equal(result.step, 'sms'); assert.equal(result.phone, seed.phone); assert.equal(result.mode, 'signup');
});

test('retained profile/vehicle data resumes regular signup at PIN; a reset resumes only its OTP step', async () => {
  const e = fixture();
  await e.service.saveAuthFlowDraft({ ...seed, step: 'profile', firstName: 'Test', lastName: 'Example',
    gender: 'prefer_not_to_say', role: 'driver', vehicleType: 'motorcycle_3_wheels', vehiclePlate: 'TEST-ONLY', profilePicture: 'file:///test.jpg' });
  const state = await fixture(e.disk).service.restoreAuthFlowDraft();
  assert.equal(state.step, 'pin'); assert.equal(state.firstName, 'Test');
  assert.equal(state.vehicleType, 'motorcycle_3_wheels'); assert.equal(state.gender, 'prefer_not_to_say');
  assert.equal(state.profilePicture, 'file:///test.jpg');
  await e.service.saveAuthFlowDraft({ ...seed, mode: 'login', step: 'resetPin', resetPinStep: 'newPin' });
  const reset = await fixture(e.disk).service.restoreAuthFlowDraft();
  assert.equal(reset.step, 'resetPin'); assert.equal(Object.hasOwn(reset, 'resetPinStep'), false);
});

test('social OTP resumes its bounded encrypted provider context without persisting the OTP', async () => {
  const token = `x.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')}.x`;
  for (const provider of ['google', 'apple']) {
    const e = fixture();
    await e.service.saveAuthFlowDraft({ ...seed, phone: '', step: 'phone', googlePhone: seed.phone,
      googleIdToken: token, googleFlow: 'signup', googleSignupStep: 'otp', socialProvider: provider, appleNonce: 'test-nonce', googleOtp: ['1'] });
    const state = await fixture(e.disk).service.restoreAuthFlowDraft();
    assert.equal(state.googleSignupStep, 'otp'); assert.equal(state.socialProvider, provider);
    assert.equal(state.googleIdToken, token); assert.equal(Object.hasOwn(state, 'googleOtp'), false);
    assert.equal(state.isGooglePhoneVerified, false);
  }
});

test('expired, future, malformed, oversized lifetime and obsolete drafts are discarded', async () => {
  const e = fixture(); await e.service.saveAuthFlowDraft(seed);
  const [key, value] = [...e.disk][0], valid = JSON.parse(value);
  const now = Date.now();
  for (const invalid of ['{', JSON.stringify({ ...valid, version: 0 }), JSON.stringify({ ...valid, expiresAt: now - 1 }),
    JSON.stringify({ ...valid, savedAt: now + 100000 }), JSON.stringify({ ...valid, expiresAt: now + 86400000 })]) {
    const reboot = fixture(new Map([[key, invalid]]));
    assert.equal(await reboot.service.restoreAuthFlowDraft(), null); assert.equal(reboot.disk.size, 0);
  }
});

test('late writes and late reads cannot resurrect a cancelled draft', async () => {
  const e = fixture(); e.io.hold = deferred();
  const write = e.service.saveAuthFlowDraft(seed); await flush();
  const clear = e.service.clearAuthFlowDraft();
  e.io.hold.resolve(); await Promise.all([write, clear]);
  assert.equal(e.service.getAuthDraftSnapshot(), null); assert.equal(e.disk.size, 0);
  let finish;
  const delayed = fixture(new Map(), { 'expo-secure-store': {
    getItemAsync: () => new Promise(resolve => { finish = resolve; }), deleteItemAsync: async () => {},
  } });
  const read = delayed.service.restoreAuthFlowDraft(); await flush();
  await delayed.service.clearAuthFlowDraft();
  finish(JSON.stringify({ version: 1, savedAt: Date.now(), expiresAt: Date.now() + 60000, state: seed }));
  assert.equal(await read, null);
});

test('temporarily locked storage retains a recoverable draft and can retry', async () => {
  const e = fixture(); await e.service.saveAuthFlowDraft(seed);
  const reboot = fixture(e.disk); reboot.io.failRead = true;
  await assert.rejects(reboot.service.restoreAuthFlowDraft(), /locked/);
  assert.equal(reboot.io.deletes, 0); assert.equal(reboot.disk.size, 1);
  reboot.io.failRead = false; assert.equal((await reboot.service.restoreAuthFlowDraft()).step, 'sms');
});

test('startup and welcome resume OTP, but an authenticated session always opens Home', async () => {
  let authenticated = false;
  const e = fixture(new Map(), {
    '@/store/hooks': { useAppSelector: () => authenticated },
    'expo-router': { Redirect: 'Redirect' }, '@/features/auth/AuthWelcome': { AuthWelcome: 'Welcome' },
  });
  await e.service.saveAuthFlowDraft(seed);
  for (const route of ['app/index.tsx', 'app/splash.tsx', 'app/auth-entry.tsx']) {
    assert.equal(e.load(route).default().props.href, '/auth');
  }
  authenticated = true;
  assert.equal(e.load('app/index.tsx').default().props.href, '/(tabs)');
  assert.equal(e.load('app/auth-entry.tsx').default().props.href, '/(tabs)');
  assert.equal(e.io.reads, 0, 'route render never reads the native keychain');
  authenticated = false;
  e.service.markAuthFlowOpened();
  assert.equal(e.load('app/auth-entry.tsx').default().type, 'Welcome', 'back to welcome must not loop into auth');
});

test('OTP/PIN keystrokes do not cause disk writes; foreground retry and login/cancel cleanup work', async t => {
  const hooks = hookHarness(), listeners = new Set();
  const e = fixture(new Map(), { react: hooks.react, 'react-native': { AppState: {
    addEventListener: (_name, cb) => { listeners.add(cb); return { remove: () => listeners.delete(cb) }; },
  } } });
  t.after(() => hooks.unmount());
  const { useAuthDraftPersistence } = e.load('hooks/auth/useAuthDraftPersistence.ts');
  let form = { ...seed }, authenticated = false;
  const render = () => hooks.render(() => useAuthDraftPersistence(form, authenticated));
  e.io.failWrite = true; render(); await flush(); assert.equal(render().saveFailed, true);
  e.io.failWrite = false; listeners.forEach(cb => cb('active')); await flush(); assert.equal(render().saveFailed, false);
  const before = e.io.writes;
  form = { ...form, pin: '1234', smsCode: ['1', '2', '3', '4', '5'] };
  render(); await flush(); assert.equal(e.io.writes, before);
  assert.equal(listeners.size, 1);
  form = { mode: 'login', step: 'phone', phone: '' }; render(); await flush(); assert.equal(e.disk.size, 0);
  form = seed; render(); await flush(); authenticated = true; render(); await flush(); assert.equal(e.disk.size, 0);
  hooks.unmount(); assert.equal(listeners.size, 0);
});

test('the real form hydrates synchronously with blank code/PIN inputs and makes no OTP request', async t => {
  const hooks = hookHarness(); let requests = 0;
  const mutation = () => [() => { requests++; return { unwrap: async () => {} }; }, { isLoading: false }];
  const e = fixture(new Map(), { react: hooks.react,
    'react-native': {}, '@/hooks/useDiditKycFlow': { useDiditKycFlow: () => ({}) },
    '@/store/api/userApi': { useSendPhoneVerificationOtpMutation: mutation, useVerifyPhoneOtpMutation: mutation },
    '@/store/api/zwangaApi': { useAppleMobileMutation: mutation, useGoogleMobileMutation: mutation, useLoginMutation: mutation, useRegisterMutation: mutation },
    './usePinResetFlow': { emptyPinResetOtp: () => Array(6).fill('') },
  });
  t.after(() => hooks.unmount());
  await e.service.saveAuthFlowDraft(seed);
  const { useAuthFormState } = e.load('hooks/auth/useAuthFormState.ts');
  const form = hooks.render(() => useAuthFormState({ initialMode: 'login' }));
  assert.equal(form.step, 'sms'); assert.equal(form.phone, seed.phone); assert.equal(form.mode, 'signup');
  assert.deepEqual(form.smsCode, Array(5).fill('')); assert.equal(form.pin, ''); assert.equal(requests, 0);
  form.setSmsCode(['1', '', '', '', '']);
  assert.equal(hooks.render(() => useAuthFormState({ initialMode: 'login' })).smsCode[0], '1', 'rerenders do not rehydrate/reset live inputs');
});

test('an expired social identity cannot be restored or treated as a session', async () => {
  const e = fixture();
  const expired = `x.${Buffer.from(JSON.stringify({ exp: 1 })).toString('base64url')}.x`;
  await e.service.saveAuthFlowDraft({ ...seed, googleIdToken: expired, googleFlow: 'signup', socialProvider: 'google' });
  assert.equal(e.service.getAuthDraftSnapshot(), null); assert.equal(e.disk.size, 0);
});
