const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

const load = loader({ 'expo-linking': { createURL: path => `zwanga://${path}` } });
const errors = load('utils/errorHelpers.ts');
const payments = load('features/arrival-payment/paymentModel.ts');

test('les messages métier français gardent leurs accents et leur précision', () => {
  for (const message of [
    'Un numéro Mobile Money est requis pour le retrait.',
    'Cette réservation a déjà été remboursée en jetons.',
    'La référence FlexPay ne correspond pas à cette transaction',
    'Votre identité doit être vérifiée avant tout retrait.',
  ]) {
    assert.equal(errors.getApiErrorMessage({ status: 400, data: { message } }, 'Erreur'), message);
  }
});

test('les anciennes variantes sans accents restent reconnues', () => {
  for (const message of ['vous devez etre conducteur', 'vous devez être conducteur']) {
    assert.equal(errors.isDriverRequiredError({ message }), true);
    assert.equal(errors.getApiErrorMessage({ message }, 'Erreur'), 'Activez votre compte conducteur pour effectuer cette action.');
  }
});

test('les codes métier restent reconnus après la reformulation française', () => {
  const error = {
    status: 403,
    data: { code: 'PASSENGER_KYC_REQUIRED', reason: 'extra_seats', message: 'Votre identité doit être vérifiée.' },
  };
  assert.equal(errors.isPassengerKycRequiredError(error), true);
  assert.equal(errors.isExtraSeatsIdentityError(error), true);
  assert.match(errors.getApiErrorMessage(error, 'Erreur'), /identité/);
});

test('les erreurs techniques ne sont pas affichées en anglais', () => {
  for (const message of ['AbortError', 'Internal server error', 'Network request failed']) {
    const result = errors.getApiErrorMessage({ message }, 'Une erreur est survenue.');
    assert.notEqual(result, message);
    assert.match(result, /connexion|service/);
  }
});

test('les libellés de paiement sont français sans modifier les valeurs techniques', () => {
  assert.equal(payments.getPaymentModeLabel('cash'), 'Paiement en espèces');
  assert.equal(payments.getPaymentModeLabel('points'), 'Jetons Zwanga');
  assert.equal(payments.getPaymentMethodForChannel('card'), 'card');
  assert.equal(payments.getPaymentMethodForChannel('mpesa'), 'mobile_money');
  assert.equal(payments.getCardPaymentResultFromUrl('zwanga://payment?status=success'), 'success');
  assert.equal(payments.getCardPaymentResultFromUrl('zwanga://payment?status=cancel'), 'cancel');
});

test('un message de paiement vide utilise un texte français compréhensible', () => {
  assert.equal(payments.getPaymentFailureMessage(null), "Le paiement n'a pas été confirmé. Vous pouvez réessayer.");
});
