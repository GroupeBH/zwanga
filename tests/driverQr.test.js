const test = require('node:test');
const assert = require('node:assert/strict');
const QRCode = require('qrcode');
const jsQR = require('jsqr');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { driverQrLink, normalizeDriverQrLink } = loader()('features/driver-qr/driverQrModel.ts');
const id = '11111111-1111-4111-8111-111111111111';
const base = 'https://api.example.test/api/v1';
const link = `${base}/public/drivers/${id}/card`;

test('a driver has one stable public QR across refreshes, without account or credit data', () => {
  assert.equal(driverQrLink(base, id), link);
  assert.equal(driverQrLink(base + '/', id.toUpperCase()), link);
  assert.notEqual(driverQrLink(base, '22222222-2222-4222-8222-222222222222'), link);
  assert.equal(normalizeDriverQrLink(link), link);
  for (const invalid of ['not-an-id', '../wallet', '11111111-1111-1111-1111-111111111111', ''])
    assert.equal(driverQrLink(base, invalid), null);
});

test('sharing rejects secrets, unsafe schemes and local URLs; development preview is explicit', () => {
  for (const invalid of ['javascript:alert(1)', 'http://api.example.test/api/v1', 'https://u:p@example.test/api/v1',
    base + '?token=secret', base + '#secret', 'http://10.0.2.2:5200/api/v1'])
    assert.equal(driverQrLink(invalid, id), null);
  for (const invalid of [link + '?token=secret', link + '#extra', link.replace('/card', '/private'),
    'https://example.test/referral/abc', 'https://user:secret@api.example.test/api/v1/public/drivers/' + id + '/card'])
    assert.equal(normalizeDriverQrLink(invalid), null);
  assert.ok(driverQrLink('http://10.0.2.2:5200/api/v1', id, true));
  assert.equal(driverQrLink('http://remote.example.test/api/v1', id, true), null);
});

test('real QR engine plus independent decoder returns the public profile URL', () => {
  const { modules } = QRCode.create(link, { errorCorrectionLevel: 'M' });
  const scale = 6, margin = 4, side = (modules.size + 2 * margin) * scale;
  const pixels = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < modules.size; y++) for (let x = 0; x < modules.size; x++) {
    if (!modules.get(y, x)) continue;
    for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
      const offset = (((y + margin) * scale + dy) * side + (x + margin) * scale + dx) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = 0;
    }
  }
  assert.equal(jsQR(pixels, side, side)?.data, link);
});

test('mobile uses the anonymous endpoint, rejects invalid IDs, and does not keep a stale card cache', async () => {
  let endpoints;
  const calls = [];
  loader({ '@/store/api/baseApi': {}, './baseApi': {
    baseApi: { injectEndpoints: options => { endpoints = options.endpoints({ query: value => value }); return {}; } },
    publicBaseQuery: async (...args) => { calls.push(args); return { data: { id } }; },
  } })('store/api/publicDriverApi.ts');
  const endpoint = endpoints.getPublicDriverCard;
  assert.equal(endpoint.keepUnusedDataFor, 0);
  assert.equal((await endpoint.queryFn('invalid', {}, {})).error.status, 'CUSTOM_ERROR');
  assert.equal(calls.length, 0);
  assert.deepEqual(await endpoint.queryFn(id, {}, {}), { data: { id } });
  assert.deepEqual(calls[0][0], { url: `/public/drivers/${id}`, cache: 'no-store' });
});
