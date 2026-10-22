export type OfferClock = { wall: number; monotonic: number };
export type OfferDeadline = { wall: number; monotonic: number };
export const offerClock = (): OfferClock => ({ wall: Date.now(), monotonic: performance.now() });

/** Count from HTTP start, not render/receipt. This conservatively deducts the
 * round trip rather than granting extra response time for a slow connection. */
export function offerDeadline(expiresAt: string, serverNow: string, started: OfferClock): OfferDeadline {
  const budget = Date.parse(expiresAt) - Date.parse(serverNow);
  const duration = Number.isFinite(budget) ? Math.max(0, Math.min(120_000, budget)) : 0;
  return { wall: started.wall + duration, monotonic: started.monotonic + duration };
}
export function offerRemaining(deadline: OfferDeadline | undefined, now = offerClock()): number {
  if (!deadline) return 0;
  return Math.max(0, Math.ceil(Math.min(deadline.wall - now.wall, deadline.monotonic - now.monotonic) / 1000));
}
