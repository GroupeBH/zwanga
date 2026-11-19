const { test } = require('node:test');
const assert = require('node:assert/strict');
const { localMetroPort } = require('../scripts/audits/mobile-runtime-probe.cjs');

test('the local runtime probe permits an explicitly selected development port', () => {
  assert.equal(localMetroPort('8081'), '8081');
  assert.equal(localMetroPort('8082'), '8082');
  assert.equal(localMetroPort('08082'), '8082');
});

test('the local runtime probe rejects URLs, privileged ports and malformed ports', () => {
  for (const value of ['', '0', '80', '1023', '65536', '8082/path', 'https://example.com', '8082.5', '-8082']) {
    assert.throws(() => localMetroPort(value), /Explicit local Metro port required/);
  }
});
