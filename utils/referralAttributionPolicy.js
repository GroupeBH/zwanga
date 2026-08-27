const DEFINITIVE_AUTHENTICATED_ATTRIBUTION_STATUSES = new Set([
  400,
  409,
  422,
]);

const DUPLICATE_EVENT_WINDOW_MS = 10_000;

const getReferralErrorStatus = (error) => {
  if (!error || typeof error !== 'object') return null;
  const status = error.status ?? error.originalStatus;
  return typeof status === 'number' ? status : null;
};

/**
 * A 404 is deliberately retryable here. During a rolling deployment it may
 * mean that the mobile binary reached an older API task where the attachment
 * route does not exist yet. The public token-resolution call already rejects
 * unknown invitations before they reach this stage.
 */
const isDefinitiveAuthenticatedAttributionError = (error) => {
  const status = getReferralErrorStatus(error);
  return (
    status !== null &&
    DEFINITIVE_AUTHENTICATED_ATTRIBUTION_STATUSES.has(status)
  );
};

/**
 * A connected user must stay in the current authenticated navigation tree.
 * Opening /auth is reserved for a device without an authenticated session.
 */
const shouldNavigateToReferralAuth = (isAuthenticated) => !isAuthenticated;

const isDuplicateReferralEvent = (
  previous,
  token,
  now = Date.now(),
) =>
  Boolean(
    previous &&
      previous.token === token &&
      Number.isFinite(previous.processedAt) &&
      now - previous.processedAt >= 0 &&
      now - previous.processedAt < DUPLICATE_EVENT_WINDOW_MS,
  );

module.exports = {
  DUPLICATE_EVENT_WINDOW_MS,
  getReferralErrorStatus,
  isDefinitiveAuthenticatedAttributionError,
  isDuplicateReferralEvent,
  shouldNavigateToReferralAuth,
};
