const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

function fixture(platform = 'android') {
  const hooks = hookHarness();
  const state = { user: { id: 'test-account' }, active: true, version: 1, available: true,
    detail: { id: 'test-payment', reference: 'TEST-RECEIPT' } };
  const events = [], dialogs = [], indicators = [], pauses = {};
  const stage = async name => {
    events.push([name]);
    if (pauses[name]) await pauses[name];
    if (state.fail === name) throw new Error('Simulated ' + name + ' failure');
  };
  const fs = { documentDirectory: 'file:///private/documents/', cacheDirectory: 'file:///private/cache/',
    EncodingType: { Base64: 'base64' },
    writeAsStringAsync: async (...args) => { events.push(['writeArgs', ...args]); await stage('write'); },
    getContentUriAsync: async () => { throw Error('Legacy text-share conversion must not run'); } };
  const params = { isDownloadingRef: { current: false }, setDownloadingPaymentId: id => indicators.push(id),
    selectedPayment: null, getPaymentDetails: () => ({ unwrap: async () => { await stage('details'); return state.detail; } }),
    closeDetails: id => events.push(['close', id]), showDialog: dialog => dialogs.push(dialog) };
  const { usePaymentReceiptDownload } = loader({
    react: { ...React, ...hooks.react },
    'react-native': { Platform: { OS: platform }, Share: { share: () => { throw Error('Text sharing is forbidden'); } } },
    '@/store/hooks': { useAppSelector: () => state.user }, '@/store/selectors': { selectUser: () => {} },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    '@/utils/errorHelpers': { getApiErrorMessage: error => error.message },
    'expo-file-system/legacy': fs,
    'expo-sharing': { isAvailableAsync: async () => { await stage('available'); return state.available; },
      shareAsync: async (...args) => { events.push(['shareArgs', ...args]); await stage('share'); } },
    '../../features/payment-history/paymentReceipt': { buildPaymentPdfBase64: () => 'JVBERi0=' },
    '../../features/payment-history/paymentHistoryModel': { sanitizeFileSegment: x => x,
      waitForNativePresentation: () => stage('dismiss') },
  })('hooks/payment-history/usePaymentReceiptDownload.ts');
  const render = () => hooks.render(() => usePaymentReceiptDownload(params));
  const submit = () => render().handleDownloadPayment({ id: 'test-payment' });
  const has = name => events.some(e => e[0] === name);
  return { hooks, state, events, dialogs, indicators, pauses, fs, params, render, submit, has };
}

for (const platform of ['android', 'ios']) test(`${platform}: receipt is a PDF file attachment, not text`, async () => {
  const f = fixture(platform);
  f.params.selectedPayment = f.state.detail;
  await f.submit();
  const uri = 'file:///private/documents/zwanga-paiement-TEST-RECEIPT.pdf';
  assert.deepEqual(f.events.find(e => e[0] === 'writeArgs'), ['writeArgs', uri, 'JVBERi0=', { encoding: 'base64' }]);
  assert.deepEqual(f.events.find(e => e[0] === 'shareArgs'), ['shareArgs', uri, {
    mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Détail paiement TEST-RECEIPT',
  }]);
  assert.ok(f.events.findIndex(e => e[0] === 'dismiss') < f.events.findIndex(e => e[0] === 'share'));
  assert.equal(f.has('details'), false);
  assert.equal(f.dialogs[0].title, 'Détail généré'); // Cancellation is not claimed to be a sent receipt.
  assert.equal(f.params.isDownloadingRef.current, false);
  assert.equal(f.indicators.at(-1), null);
  f.hooks.unmount();
});

test('receipt rejects unavailable sharing and web without writing or falling back to text', async () => {
  for (const platform of ['android', 'ios', 'web']) {
    const f = fixture(platform); f.state.available = false;
    await f.submit();
    assert.equal(f.has('write'), false); assert.equal(f.has('share'), false);
    assert.equal(f.dialogs[0].variant, 'danger');
    assert.match(f.dialogs[0].message, platform === 'web' ? /application mobile/ : /pas disponible/);
    assert.equal(f.params.isDownloadingRef.current, false); f.hooks.unmount();
  }
});

test('receipt supports cache storage fallback, and reports unavailable storage', async () => {
  const f = fixture(); f.fs.documentDirectory = null;
  await f.submit();
  assert.match(f.events.find(e => e[0] === 'shareArgs')[1], /^file:\/\/\/private\/cache\//);
  f.fs.cacheDirectory = null; f.events.length = 0; f.dialogs.length = 0;
  await f.submit();
  assert.equal(f.has('share'), false); assert.match(f.dialogs[0].message, /Stockage local indisponible/);
  f.hooks.unmount();
});

for (const stage of ['details', 'available', 'write', 'share']) test(`receipt: ${stage} failure releases lock and allows retry`, async () => {
  const f = fixture(); f.state.fail = stage;
  await f.submit();
  assert.equal(f.dialogs.length, 1); assert.equal(f.dialogs[0].variant, 'danger');
  assert.equal(f.params.isDownloadingRef.current, false); assert.equal(f.indicators.at(-1), null);
  if (stage !== 'share') assert.equal(f.has('share'), false);
  f.state.fail = null; f.dialogs.length = 0;
  await f.submit(); assert.equal(f.dialogs[0].variant, 'success'); f.hooks.unmount();
});

test('receipt: simultaneous taps create and share only one file', async () => {
  const f = fixture(), gate = deferred(); f.pauses.details = gate.promise;
  const first = f.submit(), second = f.submit();
  assert.equal(f.events.filter(e => e[0] === 'details').length, 1);
  gate.resolve(); await Promise.all([first, second]);
  assert.equal(f.events.filter(e => e[0] === 'write').length, 1);
  assert.equal(f.events.filter(e => e[0] === 'share').length, 1); f.hooks.unmount();
});

test('receipt: mismatched API detail never produces a file', async () => {
  const f = fixture(); f.state.detail.id = 'different-payment'; await f.submit();
  assert.equal(f.has('write'), false); assert.equal(f.has('share'), false);
  assert.match(f.dialogs[0].message, /ne correspond pas/); f.hooks.unmount();
});

for (const stage of ['details', 'dismiss', 'available', 'write', 'share']) test(`receipt: logout during ${stage} suppresses later presentation`, async () => {
  const f = fixture(), gate = deferred(); f.pauses[stage] = gate.promise;
  if (stage === 'dismiss') f.params.selectedPayment = f.state.detail;
  const pending = f.submit(); await tick(); assert.equal(f.has(stage), true);
  f.state.version++; gate.resolve(); await pending;
  if (stage !== 'share') assert.equal(f.has('share'), false);
  assert.equal(f.dialogs.length, 0); assert.equal(f.params.isDownloadingRef.current, false);
  f.hooks.unmount();
});

for (const transition of ['blur', 'account', 'unmount']) test(`receipt: ${transition} during file write prevents share`, async () => {
  const f = fixture(), gate = deferred(); f.pauses.write = gate.promise;
  const pending = f.submit(); await tick(); assert.equal(f.has('write'), true);
  if (transition === 'blur') { f.state.active = false; f.render(); f.state.active = true; f.render(); }
  if (transition === 'account') { f.state.user = { id: 'other-test-account' }; f.render(); }
  if (transition === 'unmount') f.hooks.unmount();
  gate.resolve(); await pending;
  assert.equal(f.has('share'), false); assert.equal(f.dialogs.length, 0);
  assert.equal(f.params.isDownloadingRef.current, false); f.hooks.unmount();
});
