const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nativeMocks = require('./helpers/walletTopUpNativeMocks.cjs');
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const hooks = hookHarness(), mocks = nativeMocks(), requests = [], events = [];
  let active = true;
  const load = loader({ ...mocks, react: hooks.react, 'react-native': { Keyboard: { dismiss() {} } },
    'expo-web-browser': {}, '@/utils/safeExternalUrl': { openExternalUrlSafely: async () => {} },
    '../../features/wallet/walletModel': { parsePositiveAmount: Number, normalizePhone: x => x,
      isTopUpSucceeded: x => x.payment.status === 'succeeded', isTopUpFailed: x => x.payment.status === 'failed',
      getPaymentStatusMessage: x => x, createWalletCardPaymentRedirectUrls: () => ({}) },
  });
  const { useWalletTopUpActions } = load('hooks/wallet/useWalletTopUpActions.ts');
  const props = { userId: 'account-a', captureScope: () => () => active,
    topUpMethod: 'mobile_money', topUpAmount: '50', topUpPhone: '+243800000000', isTopUpPhoneRequired: true,
    initiateWalletTopUp: payload => {
      let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
      requests.push({ payload, resolve, reject }); return { unwrap: () => promise };
    }, persistStoredTopUp: async value => events.push(['stored', value]), refreshAll: async () => {},
    finishSuccessfulTopUp: async () => events.push(['success']), handleFailedTopUp: async () => events.push(['failed']),
  };
  for (const key of ['setTopUpAmount', 'setTopUpMethod', 'setTopUpPhone', 'setTopUpStage', 'setTopUpStatusMessage',
    'stopTopUpAutoCheck', 'setTopUpAutoCheckAttempt', 'setTopUpOrderNumber', 'setTopUpPaymentUrl', 'startTopUpAutoCheck', 'showDialog']) {
    props[key] = value => events.push([key, value]);
  }
  return { hooks, requests, events, props, service: load('services/walletTopUpIntent.ts'),
    leave: () => { active = false; }, render: () => hooks.render(() => useWalletTopUpActions(props)) };
}

test('wallet persists before sending, suppresses double taps, and retries a lost response with the same key', async () => {
  const app = fixture(), actions = app.render();
  const first = actions.handleTopUp(); await actions.handleTopUp(); await flush();
  assert.equal(app.requests.length, 1);
  const key = app.requests[0].payload.idempotencyKey;
  assert.equal((await app.service.readWalletTopUpIntent('account-a')).idempotencyKey, key);
  app.requests[0].reject({ status: 'TIMEOUT_ERROR' }); await first;
  assert.ok(app.events.some(([name, value]) => name === 'setTopUpStage' && value === 'waiting_long'));
  const retry = app.render().handleTopUp(); await flush();
  assert.equal(app.requests[1].payload.idempotencyKey, key);
  app.requests[1].resolve({ payment: { status: 'pending', reference: 'ref', orderNumber: 'ref', message: 'En cours' } });
  await retry;
  assert.ok(app.events.some(([name]) => name === 'stored'));
  app.hooks.unmount();
});

test('leaving after POST retains the original financial reference without reopening dialogs', async () => {
  const app = fixture(); const pending = app.render().handleTopUp(); await flush();
  app.leave(); const before = app.events.length;
  app.requests[0].resolve({ payment: { status: 'succeeded', reference: 'ref', orderNumber: 'ref' } });
  await pending;
  assert.deepEqual(app.events.slice(before).map(x => x[0]), ['stored']);
  assert.equal((await app.service.readWalletTopUpIntent('account-a')).paymentReference, 'ref');
  app.hooks.unmount();
});
