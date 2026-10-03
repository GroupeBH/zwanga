const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loader } = require('./helpers/loadTypeScript.cjs');
const link = 'https://invite.example.test/synthetic';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';

function fixture() {
  const calls = [], files = new Map();
  const app = { current: true, available: true, afterWrite() {} };
  const fileSystem = {
    cacheDirectory: 'file:///synthetic-cache/', EncodingType: { Base64: 'base64' },
    getInfoAsync: async uri => ({ exists: files.has(uri) }),
    writeAsStringAsync: async (uri, content, options) => { calls.push(['write', uri, content, options]); files.set(uri, content); app.afterWrite(); },
    deleteAsync: async uri => { calls.push(['delete', uri]); files.delete(uri); },
  };
  const sharing = { isAvailableAsync: async () => app.available,
    shareAsync: async (uri, options) => { calls.push(['share', uri, options]); } };
  const service = loader({ 'react-native': { Platform: { OS: 'android' } },
    'expo-file-system/legacy': fileSystem, 'expo-sharing': sharing,
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_, value) => createHash('sha256').update(value).digest('hex') },
  })('utils/shareReferralQr.ts');
  const svg = { toDataURL: (cb, options) => { calls.push(['export', options]); cb(png); } };
  return Object.assign(app, { calls, files, sharing, service, svg, share: () => service.shareReferralQr(svg, link, () => app.current) });
}

test('exports a high-resolution PNG and shares with explicit Android/iOS types', async () => {
  const app = fixture();
  assert.equal(await app.share(), true);
  assert.deepEqual(app.calls[0], ['export', { width: 1024, height: 1024 }]);
  assert.equal(app.calls[1][2], png);
  assert.equal(app.calls[2][2].mimeType, 'image/png');
  assert.equal(app.calls[2][2].UTI, 'public.png');
  assert.equal(app.files.size, 1, 'keep the attachment for apps that read after sheet dismissal');
  assert.equal(app.calls[1][1].includes(link), false);
  await app.share();
  assert.equal(app.calls.filter(call => call[0] === 'export').length, 1);
  assert.equal(app.files.size, 1, 'repeated shares reuse the cache file');
});

test('unsupported sharing does not generate or write an image', async () => {
  const app = fixture(); app.available = false;
  await assert.rejects(app.share(), /Sharing unavailable/);
  assert.deepEqual(app.calls, []);
});

test('closing before export prevents any native share', async () => {
  const app = fixture(); app.current = false;
  assert.equal(await app.share(), false);
  assert.deepEqual(app.calls, []);
});

test('account change during a file write removes only the newly created unshared image', async () => {
  const app = fixture(); app.afterWrite = () => { app.current = false; };
  assert.equal(await app.share(), false);
  assert.equal(app.calls.some(call => call[0] === 'share'), false);
  assert.equal(app.calls.filter(call => call[0] === 'delete').length, 1);
  assert.equal(app.files.size, 0);
});

test('an invalid URL is rejected before invoking native modules', async () => {
  const app = fixture();
  await assert.rejects(app.service.shareReferralQr(app.svg, 'ZWANGA123', () => true));
  assert.deepEqual(app.calls, []);
});

test('PNG export rejects invalid data, native errors and a missing callback', async t => {
  const { service } = fixture();
  await assert.rejects(service.referralQrPng({ toDataURL: cb => cb('<svg>not png</svg>') }));
  await assert.rejects(service.referralQrPng({ toDataURL: () => { throw new Error('native'); } }), /native/);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const pending = service.referralQrPng({ toDataURL() {} });
  const rejection = assert.rejects(pending, /timed out/);
  t.mock.timers.tick(8000); await rejection;
});
