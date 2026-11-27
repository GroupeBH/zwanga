export function hasUnseenPaymentRequest(requestedAt: string | null | undefined, dismissedAt?: string) {
  const requested = Date.parse(requestedAt ?? '');
  return Number.isFinite(requested) && (!dismissedAt || requested > Date.parse(dismissedAt));
}
