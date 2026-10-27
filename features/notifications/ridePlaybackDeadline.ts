/** Admission uses the server deadline; a native clip already started may finish
 * its 60 seconds. Restoring a card never creates or renews that timestamp. */
export function ridePlaybackDeadline(data: Record<string, unknown> | undefined): number {
  const server = Date.parse(String(data?.ringUntil ?? ''));
  const started = Date.parse(String(data?.nativeSoundStartedAt ?? ''));
  const until = Date.parse(String(data?.nativeSoundUntil ?? ''));
  const native = Number.isFinite(server) && Number.isFinite(started) && Number.isFinite(until) &&
    started <= server && started <= Date.now() + 5000 && until > started && until <= started + 60000;
  let deadline = native ? until : server;
  for (const expiry of [data?.expiresAt, data?.alertExpiresAt]) {
    if (expiry !== undefined) deadline = Math.min(deadline, Date.parse(String(expiry)));
  }
  return deadline;
}
