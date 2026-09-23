const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function resetEnvironment(overrides = {}) {
  const hooks = hookHarness();
  const calls = [], discarded = [], dialogs = [];
  const mutation = (name, response) => {
    const trigger = payload => ({
      unwrap: async () => {
        calls.push({ name, payload });
        return overrides[name] ? overrides[name](payload) : response;
      },
      reset: () => discarded.push(name),
    });
    return () => [trigger, { isLoading: false }];
  };
  const load = loader({
    react: hooks.react,
    'react-native': {},
    '@/config/env': { isSignupOtpVerificationEnabled: true },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: dialog => dialogs.push(dialog) }) },
    '@/store/api/authApi': {
      useRequestPinResetOtpMutation: mutation('send', { message: 'Si ce compte existe...' }),
      useVerifyPinResetOtpMutation: mutation('verify', { resetToken: 'one-time-proof', expiresInSeconds: 300 }),
      useResetPinMutation: mutation('reset', { message: 'PIN réinitialisé' }),
    },
    '@/utils/errorHelpers': { getApiErrorMessage: (error, fallback) => error.message || fallback },
    '@/store/slices/authSlice': { saveTokensAndUpdateState: () => { throw new Error('Reset must not authenticate'); } },
  });
  const { usePinResetFlow } = load('hooks/auth/usePinResetFlow.ts');
  const props = { phone: '0991234567', active: true };
  return { hooks, calls, discarded, dialogs, load, props, render: () => hooks.render(() => usePinResetFlow(props.phone, props.active)) };
}

test('reset API contract uses the three POST endpoints and excludes newPin from login', () => {
  const builder = { mutation: definition => definition, query: definition => definition };
  let endpoints;
  const load = loader({
    '../../services/tokenStorage': {},
    '../../services/tokenRefresh': {},
    '../../store/slices/authSlice': {},
    './authRefreshApi': {},
    './baseApi': { baseApi: { injectEndpoints: definition => {
      endpoints = definition.endpoints(builder);
      return {};
    } } },
    './userApi': {},
    './identityContracts': {},
    './profileMapper': {},
    '@react-native-async-storage/async-storage': {},
  });
  load('store/api/authApi.ts');
  assert.deepEqual(endpoints.login.query({ phone: '099', pin: '1234', newPin: '5678' }), {
    url: '/auth/login', method: 'POST', body: { phone: '099', pin: '1234' },
  });
  const actions = [
    ['requestPinResetOtp', '/auth/pin/reset/request-otp', { phone: '099' }],
    ['verifyPinResetOtp', '/auth/pin/reset/verify-otp', { phone: '099', otp: '123456' }],
    ['resetPin', '/auth/pin/reset', { resetToken: 'proof', newPin: '5678' }],
  ];
  for (const [name, url, body] of actions) {
    assert.deepEqual(endpoints[name].query(body), { url, method: 'POST', body });
  }
  const user = load('store/api/user/getProfileSummary.endpoints.ts').buildGetProfileSummaryEndpoints(builder);
  assert.deepEqual(user.updatePin.query({ oldPin: '1234', newPin: '5678' }), {
    url: '/users/pin/change', method: 'POST', body: { oldPin: '1234', newPin: '5678' },
  });
  assert.equal(user.updatePinWithOtp, undefined);
});

test('only a verified OTP authorizes resetting; the proof is discarded after use', async () => {
  const app = resetEnvironment();
  await assert.rejects(app.render().confirmPin('5678'), /expiré/);
  assert.equal(app.calls.length, 0);
  assert.equal(await app.render().requestOtp(), true);
  assert.equal(await app.render().verifyOtp('123456'), true);
  assert.equal(await app.render().confirmPin('5678'), true);
  assert.deepEqual(app.calls, [
    { name: 'send', payload: { phone: '0991234567' } },
    { name: 'verify', payload: { phone: '0991234567', otp: '123456' } },
    { name: 'reset', payload: { resetToken: 'one-time-proof', newPin: '5678' } },
  ]);
  assert.deepEqual(app.discarded, ['send', 'verify', 'reset']);
  await assert.rejects(app.render().confirmPin('0000'), /expiré/);
  assert.equal(app.calls.filter(call => call.name === 'reset').length, 1);
  app.hooks.unmount();
});

test('invalid OTP never grants a reset proof', async () => {
  const app = resetEnvironment({ verify: async () => { throw { status: 400 }; } });
  await assert.rejects(app.render().verifyOtp('999999'));
  await assert.rejects(app.render().confirmPin('5678'));
  assert.deepEqual(app.discarded, ['verify']);
  assert.ok(!app.calls.some(call => call.name === 'reset'));
});

test('the proof expires after five minutes', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const app = resetEnvironment();
  await app.render().verifyOtp('123456');
  t.mock.timers.tick(300000);
  await assert.rejects(app.render().confirmPin('5678'), /expiré/);
  assert.ok(!app.calls.some(call => call.name === 'reset'));
});

test('resending OTP, closing the flow, changing phone and unmounting clear the proof', async () => {
  for (const change of ['resend', 'close', 'phone', 'unmount']) {
    const app = resetEnvironment();
    await app.render().verifyOtp('123456');
    if (change === 'resend') await app.render().requestOtp();
    if (change === 'close') {
      app.props.active = false; app.render();
      app.props.active = true; app.render();
    }
    if (change === 'phone') { app.props.phone = '0990000000'; app.render(); }
    if (change === 'unmount') app.hooks.unmount();
    await assert.rejects(app.render().confirmPin('5678'), /expiré/);
    assert.ok(!app.calls.some(call => call.name === 'reset'));
  }
});

test('a delayed OTP response cannot restore a proof after cancellation', async () => {
  let resolve;
  const app = resetEnvironment({ verify: () => new Promise(done => { resolve = done; }) });
  const verifying = app.render().verifyOtp('123456');
  app.props.active = false; app.render();
  resolve({ resetToken: 'stale-proof', expiresInSeconds: 300 });
  assert.equal(await verifying, false);
  app.props.active = true; app.render();
  await assert.rejects(app.render().confirmPin('5678'));
});

test('opening a reset screen while its SMS request is pending still completes the request', async () => {
  let resolve;
  const app = resetEnvironment({ send: () => new Promise(done => { resolve = done; }) });
  app.props.active = false;
  const sending = app.render().requestOtp();
  app.props.active = true; app.render();
  resolve({ message: 'sent' });
  assert.equal(await sending, true);
});

test('duplicate submits and ambiguous network failures never replay a reset token', async () => {
  let reject;
  const app = resetEnvironment({ reset: () => new Promise((_resolve, fail) => { reject = fail; }) });
  await app.render().verifyOtp('123456');
  const resetting = app.render().confirmPin('5678');
  assert.equal(await app.render().confirmPin('5678'), false);
  reject({ status: 'TIMEOUT_ERROR' });
  await assert.rejects(resetting);
  await assert.rejects(app.render().confirmPin('5678'), /expiré/);
  assert.equal(app.calls.filter(call => call.name === 'reset').length, 1);
});

function phoneScreen(overrides) {
  const app = resetEnvironment(overrides);
  const ref = { current: null };
  const props = {
    step: 'pin', mode: 'login', phone: '0991234567',
    resetOtpCode: Array(6).fill(''), resetNewPin: '', resetNewPinConfirm: '',
    smsCode: Array(5).fill(''), pin: '', pinConfirm: '',
    showDialog: dialog => app.dialogs.push(dialog),
    pinInputRef: ref, pinConfirmInputRef: ref, resetPinInputRef: ref,
    smsInputRefs: { current: [] }, resetOtpInputRefs: { current: [] },
    focusAfterInteractions() {}, setIsSendingResetOtp() {},
    login: () => { throw new Error('Reset must not use login'); },
    dispatch: () => { throw new Error('Reset must not install a session'); },
  };
  for (const [setter, field] of [
    ['setStep', 'step'], ['setPhone', 'phone'], ['setResetPinStep', 'resetPinStep'],
    ['setResetOtpCode', 'resetOtpCode'], ['setResetNewPin', 'resetNewPin'],
    ['setResetNewPinConfirm', 'resetNewPinConfirm'], ['setPin', 'pin'],
  ]) props[setter] = value => { props[field] = value; };
  const { usePhoneAuthActions } = app.load('hooks/auth/usePhoneAuthActions.ts');
  return { ...app, props, render: () => app.hooks.render(() => usePhoneAuthActions(props)) };
}

test('forgotten PIN from login goes through six-digit OTP then returns to PIN login', async () => {
  const app = phoneScreen();
  await app.render().handleForgotPin();
  assert.equal(app.props.step, 'resetPin');
  assert.equal(app.props.resetOtpCode.length, 6);
  app.props.resetOtpCode = '12345'.split('');
  await app.render().handleVerifyResetOtp();
  assert.ok(!app.calls.some(call => call.name === 'verify'));
  app.props.resetOtpCode = '123456'.split('');
  await app.render().handleVerifyResetOtp();
  assert.equal(app.props.resetPinStep, 'newPin');
  app.render().handleResetPinChange('5x6789');
  app.render().handleResetPinConfirmChange('5678');
  await app.render().handleResetPinSubmit();
  assert.equal(app.props.step, 'pin');
  assert.equal(app.props.resetNewPin, '');
  assert.equal(app.props.resetNewPinConfirm, '');
  assert.match(app.dialogs.at(-1).message, /Connectez-vous/);
  assert.equal(app.calls.filter(call => call.name === 'reset').length, 1);
});

test('an expired or rejected proof sends the login flow back to OTP and clears the PIN', async () => {
  const app = phoneScreen({ reset: async () => { throw { status: 400 }; } });
  await app.render().handleForgotPin();
  app.props.resetOtpCode = '123456'.split('');
  await app.render().handleVerifyResetOtp();
  app.props.resetNewPin = app.props.resetNewPinConfirm = '5678';
  await app.render().handleResetPinSubmit();
  assert.equal(app.props.resetPinStep, 'otp');
  assert.equal(app.props.resetNewPin, '');
  assert.equal(app.props.resetNewPinConfirm, '');
  assert.equal(app.dialogs.at(-1).variant, 'danger');
});
