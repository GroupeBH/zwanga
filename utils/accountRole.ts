// Account capability comes from the server role, never a legacy flag or a vehicle.
// `both` remains a read-only compatibility alias for previously issued accounts.
export function isDriverAccount(user?: { role?: unknown; isDriver?: unknown } | null): boolean {
  return user?.role === 'driver' || user?.role === 'both';
}
