const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loader } = require('./helpers/loadTypeScript.cjs');
test('service amounts convert minor units and do not round away repayments', () => {
  const { proAmount, proError, statusNames } = loader()('features/pro-services/model.ts');
  assert.match(proAmount(150125, 'CDF'), /1.501,25 CDF/);
  assert.equal(proError({ data: { message: 'Contrat absent' } }), 'Contrat absent');
  assert.equal(proError({ data: { message: ['A', 'B'] } }), 'A\nB');
  assert.equal(statusNames.quoted, 'Devis proposé');
});
test('services API uses the authenticated RTK transport and isolated cache tags', () => {
  let endpoints;
  loader({ './baseApi': { baseApi: { injectEndpoints: config => { endpoints = config.endpoints({ query: value => value, mutation: value => value }); return {}; } } } })('store/api/proServicesApi.ts');
  assert.equal(endpoints.createProCase.query({ test: true }).method, 'POST');
  assert.equal(endpoints.createProCase.query({ test: true }).timeout, 15000);
  assert.equal(endpoints.acceptProQuote.query({ id: 'case', quoteVersion: 2, consent: true }).url, '/pro-services/mine/case/accept');
  assert.deepEqual(endpoints.acceptProQuote.invalidatesTags, ['ProServices']);
  assert.match(endpoints.getProCase.query('case/a'), /case%2Fa/);
});
test('services screens introduce no global polling, native modals or automatic payment', () => {
  for (const filename of ['features/pro-services/ServicesScreen.tsx', 'app/services/new.tsx', 'app/services/[id].tsx']) {
    const source = fs.readFileSync(path.join(__dirname, '..', filename), 'utf8');
    assert.doesNotMatch(source, /setInterval|pollingInterval|<Modal\b|FlexPay|use.*Location/);
    assert.match(source, /useScreenIsActive/);
    assert.ok(source.split('\n').length <= 400);
  }
});
