const test = require('node:test');
const assert = require('node:assert/strict');
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { Platform: { OS: 'android' }, Share: { share: async () => {} } };
const link = 'https://invite.example.test/abc?provider=chottulink&referralToken=synthetic-token-1234';
const load = loader({ 'react-native': native });
const { referralQrLink } = load('features/referrals/referralQrModel.ts');

test('QR uses the validated server URL without dropping attribution parameters', () => {
  assert.equal(referralQrLink(`  ${link}  `), link);
  for (const invalid of [undefined, '', 'ZWANGA123', 'http://example.test', 'javascript:alert(1)',
    'https://user:password@example.test/x', 'https://example.test/' + 'x'.repeat(513)]) {
    assert.equal(referralQrLink(invalid), null);
  }
});

test('real QR engine and independent decoder round-trip the exact referral URL', () => {
  for (const value of [link, 'https://invite.example.test/short', `${link}&campaign=%C3%A9t%C3%A9`]) {
    // Same QR engine/ecl as react-native-qrcode-svg; synthetic RGBA image, not a camera test.
    const { modules } = QRCode.create(referralQrLink(value), { errorCorrectionLevel: 'M' });
    const scale = 6, margin = 4, side = (modules.size + 2 * margin) * scale;
    const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
    for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) {
      if (!modules.get(y, x)) continue;
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        const offset = (((y + margin) * scale + dy) * side + (x + margin) * scale + dx) * 4;
        pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
      }
    }
    assert.equal(jsQR(pixels, side, side, { inversionAttempts: 'dontInvert' })?.data, value);
  }
});

function fixture(summary) {
  const hooks = hookHarness();
  let version = 0, requests = 0, finish;
  const props = { summary, userId: 'synthetic-user', active: true,
    refetchSummary: () => { requests++; return { unwrap: () => new Promise(resolve => { finish = resolve; }) }; } };
  const { useReferralQr } = loader({ react: hooks.react, 'react-native': native,
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
  })('hooks/referrals/useReferralQr.ts');
  return { props, hooks, render: () => hooks.render(() => useReferralQr(props)), requests: () => requests,
    finish: data => finish(data), logout: () => { version++; } };
}

test('generation is on demand and a cached valid link works without another request', async () => {
  const app = fixture({ shareLink: link, code: 'DEMO' });
  assert.equal(app.render().state, null);
  assert.equal(app.requests(), 0);
  await app.render().open();
  assert.deepEqual(app.render().state, { phase: 'ready', link, code: 'DEMO' });
  assert.equal(app.requests(), 0);
  app.hooks.unmount();
});

test('missing link refreshes once, rejects duplicate taps and never invents a URL', async () => {
  const app = fixture();
  const action = app.render().open();
  assert.equal(app.render().state.phase, 'loading');
  await app.render().open();
  assert.equal(app.requests(), 1);
  app.finish({ code: 'NOT-A-URL', shareLink: '' }); await action;
  assert.equal(app.render().state.phase, 'error');
  const retry = app.render().open();
  app.finish({ code: 'DEMO', shareLink: link }); await retry;
  assert.equal(app.render().state.link, link);
  app.hooks.unmount();
});

test('network failure stops loading and a subsequent retry can succeed', async () => {
  const app = fixture();
  app.props.refetchSummary = () => ({ unwrap: async () => { throw new Error('Network unavailable'); } });
  await app.render().open();
  assert.equal(app.render().state.phase, 'error');
  app.props.refetchSummary = () => ({ unwrap: async () => ({ code: 'DEMO', shareLink: link }) });
  await app.render().open();
  assert.equal(app.render().state.phase, 'ready');
  app.hooks.unmount();
});

for (const boundary of ['close', 'blur', 'account', 'logout', 'unmount']) {
  test(`a late referral request is ignored after ${boundary}`, async () => {
    const app = fixture();
    const action = app.render().open();
    if (boundary === 'close') app.render().close();
    if (boundary === 'blur') { app.props.active = false; app.render(); }
    if (boundary === 'account') { app.props.userId = 'different-user'; app.render(); }
    if (boundary === 'logout') app.logout();
    if (boundary === 'unmount') app.hooks.unmount();
    app.finish({ code: 'DEMO', shareLink: link }); await action;
    if (boundary !== 'unmount') assert.notEqual(app.render().state?.phase, 'ready');
    app.hooks.unmount();
  });
}

test('a closed first request cannot replace a newer invitation', async () => {
  const app = fixture();
  const first = app.render().open(), finishFirst = app.finish;
  // Capture the first resolver before another request updates the fixture.
  let firstResolved;
  app.props.refetchSummary = () => ({ unwrap: () => new Promise(resolve => { firstResolved = resolve; }) });
  app.render().close();
  const second = app.render().open();
  firstResolved({ code: 'SECOND', shareLink: link + '&new=1' }); await second;
  finishFirst({ code: 'FIRST', shareLink: link }); await first;
  assert.equal(app.render().state.code, 'SECOND');
  app.hooks.unmount();
});

test('anonymous or hidden screens cannot prepare an invitation', async () => {
  const app = fixture(); app.props.userId = undefined;
  await app.render().open();
  app.props.userId = 'synthetic-user'; app.props.active = false;
  await app.render().open();
  assert.equal(app.requests(), 0);
  assert.equal(app.render().state, null);
  app.hooks.unmount();
});
