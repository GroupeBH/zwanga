const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DUPLICATE_EVENT_WINDOW_MS,
  getReferralErrorStatus,
  isDefinitiveAuthenticatedAttributionError,
  isDuplicateReferralEvent,
  shouldNavigateToReferralAuth,
} = require('../utils/referralAttributionPolicy');

test('a connected user never navigates to the authentication flow', () => {
  assert.equal(shouldNavigateToReferralAuth(true), false);
  assert.equal(shouldNavigateToReferralAuth(false), true);
});

test('a 404 keeps the invitation for a rolling backend deployment', () => {
  assert.equal(
    isDefinitiveAuthenticatedAttributionError({ status: 404 }),
    false,
  );
});

test('network and server failures keep the invitation for retry', () => {
  for (const status of ['FETCH_ERROR', 'TIMEOUT_ERROR', 500, 502, 503]) {
    assert.equal(
      isDefinitiveAuthenticatedAttributionError({ status }),
      false,
    );
  }
});

test('business rejections consume an unusable invitation', () => {
  for (const status of [400, 409, 422]) {
    assert.equal(
      isDefinitiveAuthenticatedAttributionError({ status }),
      true,
    );
  }
});

test('extracts numeric RTK Query error statuses', () => {
  assert.equal(getReferralErrorStatus({ status: 409 }), 409);
  assert.equal(getReferralErrorStatus({ originalStatus: 422 }), 422);
  assert.equal(getReferralErrorStatus({ status: 'FETCH_ERROR' }), null);
  assert.equal(getReferralErrorStatus(null), null);
});

test('deduplicates the same native event only inside the short window', () => {
  const previous = { token: 'abcdefghijklmnop', processedAt: 1_000 };
  assert.equal(
    isDuplicateReferralEvent(previous, previous.token, 1_001),
    true,
  );
  assert.equal(
    isDuplicateReferralEvent(
      previous,
      previous.token,
      1_000 + DUPLICATE_EVENT_WINDOW_MS,
    ),
    false,
  );
  assert.equal(
    isDuplicateReferralEvent(previous, 'different-token-1234', 1_001),
    false,
  );
});
