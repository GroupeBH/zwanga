const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { getApiErrorMessage } = loader()('utils/errorHelpers.ts');

test('a settlement conflict explains the next step without a technical booking identifier', () => {
  for (const error of [
    { status: 409, data: { code: 'DRIVER_EARNING_RECONCILIATION_REQUIRED', message: 'internal details' } },
    { status: 400, data: { message: 'Le gain conducteur existant est incohérent pour la réservation 00000000-0000-4000-8000-000000000001' } },
  ]) {
    const message = getApiErrorMessage(error, 'Erreur');
    assert.match(message, /Actualisez le trajet/);
    assert.match(message, /assistance/);
    assert.doesNotMatch(message, /00000000|gain conducteur|pas été débité|espèces/i);
  }
});

test('a genuine lack of tokens retains its understandable payment error', () => {
  assert.equal(getApiErrorMessage({ status: 400, data: { message: 'Solde de jetons insuffisant' } }, 'Erreur'),
    'Solde de jetons insuffisant');
});
