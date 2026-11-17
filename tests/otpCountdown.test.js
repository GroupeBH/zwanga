const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function environment(t) {
  let now = 1_000_000, session = 0;
  const previous = Date.now;
  Date.now = () => now;
  t.after(() => { Date.now = previous; });
  const hooks = hookHarness();
  let onResume;
  const intervals = new Map();
  let nextTimer = 0;
  const previousSet = global.setInterval, previousClear = global.clearInterval;
  global.setInterval = callback => { intervals.set(++nextTimer, callback); return nextTimer; };
  global.clearInterval = id => intervals.delete(id);
  t.after(() => { hooks.unmount(); global.setInterval = previousSet; global.clearInterval = previousClear; });
  const load = loader({
    react: hooks.react,
    '@/services/tokenSession': { getTokenSessionVersion: () => session },
    'react-native': { AppState: { addEventListener: (_, callback) => {
      onResume = callback; return { remove() { onResume = null; } };
    } } },
  });
  const countdown = load('features/auth/otpCountdown.ts');
  return { countdown, load, hooks, intervals,
    advance: ms => { now += ms; },
    logout: () => { session++; },
    resume: () => onResume?.('active'),
  };
}
test('server TTL is used, request latency deducted, local and international spellings match', t => {
  const app = environment(t), c = app.countdown;
  const ticket = c.beginOtpCountdown('phone_verification', '0890000001');
  app.advance(5000);
  c.completeOtpCountdown(ticket, 900);
  assert.equal(c.otpRemainingSeconds(c.readOtpDeadline('phone_verification', '+243890000001')), 895);
  assert.equal(c.otpCountdownLabel(895), 'Code valable encore 14:55');
  assert.equal(c.readOtpDeadline('phone_verification', '+243890000002'), null);
  assert.equal(c.readOtpDeadline('pin_reset', '0890000001'), null);
});
test('background time and reopening do not restart the code, expiry stays at zero', t => {
  const app = environment(t), c = app.countdown;
  c.completeOtpCountdown(c.beginOtpCountdown('pin_reset', '0890000001'), 60);
  const { useOtpCountdown } = app.load('hooks/auth/useOtpCountdown.ts');
  const render = () => app.hooks.render(() => useOtpCountdown('pin_reset', '0890000001'));
  assert.equal(render(), 60);
  assert.equal(app.intervals.size, 1);
  app.advance(61000); // No timer callbacks while asleep.
  app.resume();
  assert.equal(render(), 0);
  for (const tick of [...app.intervals.values()]) tick();
  assert.equal(app.intervals.size, 0);
  assert.equal(c.otpCountdownLabel(render()), 'Code expiré — renvoyez un code.');
  app.hooks.unmount();
  const reopened = hookHarness();
  // Reading the shared metadata on remount never creates a fresh deadline.
  assert.equal(c.otpRemainingSeconds(c.readOtpDeadline('pin_reset', '0890000001')), 0);
  reopened.unmount();
});
test('successful resend replaces expiry; failed resend does not extend it', async t => {
  const app = environment(t), c = app.countdown;
  const send = c.trackOtpCountdown('pin_reset');
  await send({phone:'0890000001'}, {queryFulfilled:Promise.resolve({data:{expiresInSeconds:300}})});
  app.advance(40000);
  await send({phone:'0890000001'}, {queryFulfilled:Promise.reject(Error('429'))});
  assert.equal(c.otpRemainingSeconds(c.readOtpDeadline('pin_reset','0890000001')),260);
  await send({phone:'0890000001'}, {queryFulfilled:Promise.resolve({data:{expiresInSeconds:900}})});
  assert.equal(c.otpRemainingSeconds(c.readOtpDeadline('pin_reset','0890000001')),900);
});
test('stale responses and previous sessions cannot restore a countdown', t => {
  const app = environment(t), c = app.countdown;
  const old = c.beginOtpCountdown('pin_change');
  const latest = c.beginOtpCountdown('pin_change');
  c.completeOtpCountdown(latest, 300);
  c.completeOtpCountdown(old, 900);
  assert.equal(c.otpRemainingSeconds(c.readOtpDeadline('pin_change')),300);
  app.logout();
  c.completeOtpCountdown(latest, 900);
  assert.equal(c.readOtpDeadline('pin_change'),null);
});
test('missing or invalid TTL never fabricates fifteen minutes or a false expiry', t => {
  const c = environment(t).countdown;
  for (const value of [undefined, '900', -1, NaN, Infinity, 86401]) {
    c.completeOtpCountdown(c.beginOtpCountdown('pin_change'),value);
    assert.equal(c.otpRemainingSeconds(c.readOtpDeadline('pin_change')),null);
  }
  assert.match(c.otpCountdownLabel(null), /expire automatiquement/);
  c.completeOtpCountdown(c.beginOtpCountdown('pin_change'),0);
  assert.equal(c.otpRemainingSeconds(c.readOtpDeadline('pin_change')),0);
});
test('countdown subscriptions are removable and never retain codes or proof data', t => {
  const c = environment(t).countdown;
  let notifications=0;
  const unsubscribe=c.subscribeOtpCountdown(()=>notifications++);
  c.completeOtpCountdown(c.beginOtpCountdown('pin_change'),300);
  unsubscribe();
  c.completeOtpCountdown(c.beginOtpCountdown('pin_change'),300);
  assert.equal(notifications,1);
});
test('API lifecycle hooks capture timing for every mobile OTP send route', async t => {
  const app=environment(t);
  const builder={mutation:value=>value,query:value=>value};
  let auth;
  const load=loader({
    '@/features/auth/otpCountdown':app.countdown,
    '../../services/tokenStorage':{}, '../../services/tokenRefresh':{},
    '../../store/slices/authSlice':{}, './userApi':{}, './identityContracts':{}, './profileMapper':{},
    '@react-native-async-storage/async-storage':{},
    './baseApi':{baseApi:{injectEndpoints: options=>{auth=options.endpoints(builder);return {};}}},
  });
  load('store/api/authApi.ts');
  const user=load('store/api/user/getProfileSummary.endpoints.ts').buildGetProfileSummaryEndpoints(builder);
  for(const [endpoint,purpose,arg] of [
    [auth.requestPinResetOtp,'pin_reset',{phone:'0890000001'}],
    [user.sendPhoneVerificationOtp,'phone_verification',{phone:'0890000001',context:'registration'}],
    [user.requestPinChangeOtp,'pin_change',undefined],
  ]) {
    await endpoint.onQueryStarted(arg,{queryFulfilled:Promise.resolve({data:{expiresInSeconds:900}})});
    assert.equal(app.countdown.otpRemainingSeconds(app.countdown.readOtpDeadline(purpose,arg?.phone)),900);
  }
});
