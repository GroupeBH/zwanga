const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { loader } = require('./helpers/loadTypeScript.cjs');
const link = 'https://api.example.test/api/v1/public/drivers/11111111-1111-4111-8111-111111111111/card';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB';
function fixture() {
  const calls = [], files = new Map();
  const state = { current: true, available: true, afterWrite() {} };
  const fileSystem = {
    cacheDirectory: 'file:///synthetic-cache/', EncodingType: { Base64: 'base64' },
    getInfoAsync: async uri => ({ exists: files.has(uri) }),
    writeAsStringAsync: async (uri, content) => { calls.push(['write', uri]); files.set(uri, content); state.afterWrite(); },
    deleteAsync: async uri => { calls.push(['delete', uri]); files.delete(uri); },
  };
  const { shareDriverQr } = loader({ 'react-native': { Platform: { OS: 'android' } },
    'expo-file-system/legacy': fileSystem,
    'expo-sharing': { isAvailableAsync: async () => state.available,
      shareAsync: async (uri, options) => { calls.push(['share', uri, options]); } },
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_, value) => createHash('sha256').update(value).digest('hex') },
  })('utils/shareDriverQr.ts');
  const svg = { toDataURL: (cb, options) => { calls.push(['export', options]); cb(png); } };
  return Object.assign(state, { calls, files, share: (url = link) => shareDriverQr(svg, url, () => state.current) });
}
test('driver QR exports 1024px PNG in its own cache, with native share metadata', async () => {
  const f = fixture();
  assert.equal(await f.share(), true);
  assert.deepEqual(f.calls[0], ['export', { width: 1024, height: 1024 }]);
  assert.match(f.calls[1][1], /zwanga-driver-qr-v1-/);
  assert.equal(f.calls[2][2].mimeType, 'image/png');
  assert.equal(f.calls[2][2].UTI, 'public.png');
  assert.match(f.calls[2][2].dialogTitle, /fiche conducteur/);
  await f.share();
  assert.equal(f.calls.filter(c => c[0] === 'export').length, 1);
  assert.equal(f.files.size, 1);
});
test('driver export refuses referral URLs or local development URLs', async () => {
  const f = fixture();
  await assert.rejects(f.share('https://example.test/invite'));
  await assert.rejects(f.share(link.replace('https://api.example.test', 'http://10.0.2.2:5200')));
  assert.deepEqual(f.calls, []);
});
test('unsupported share and stale session do not export a file', async () => {
  const f = fixture(); f.available = false;
  await assert.rejects(f.share(), /Sharing unavailable/);
  f.current = false;
  assert.equal(await f.share(), false);
  assert.deepEqual(f.calls, []);
});
test('account change during a write only deletes the new unshared driver QR', async () => {
  const f = fixture(); f.afterWrite = () => { f.current = false; };
  assert.equal(await f.share(), false);
  assert.equal(f.calls.some(c => c[0] === 'share'), false);
  assert.equal(f.calls.filter(c => c[0] === 'delete').length, 1);
  assert.equal(f.files.size, 0);
});
