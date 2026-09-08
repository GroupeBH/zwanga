/**
 * Network timeouts are intentionally split by request type.
 *
 * Reads should fail quickly enough to keep the UI responsive. Mutations may
 * trigger server-side work (notifications, payment checks, route updates), so
 * they get a longer response window before their outcome becomes ambiguous.
 */
export const DEFAULT_API_TIMEOUT_MS = 20_000;
export const CRITICAL_MUTATION_TIMEOUT_MS = 60_000;

/** Delays used to verify server state after a timeout or an aborted request. */
export const MUTATION_RECONCILIATION_DELAYS_MS = [0, 900, 1_800, 3_600] as const;
