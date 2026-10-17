/** A missing role is unknown, not a passenger. Keep the legacy `both` alias. */
export function isHomeProfileReady(user?: { id?: unknown; role?: unknown } | null): boolean {
  return typeof user?.id === 'string' && user.id.trim().length > 0 &&
    (user.role === 'driver' || user.role === 'both' || user.role === 'passenger');
}
