/** Decorative route only: no GPS, map SDK, network or per-frame JS calculations. */
export const HOME_LOADER_ROUTE = 'M44 178 C144 178 130 70 248 70';

// Sample once. Native Animated interpolates position AND heading along the same
// cubic as the SVG route, so the car follows the bends instead of sliding across it.
export const HOME_LOADER_WAYPOINTS = Array.from({ length: 49 }, (_, index) => {
  const t = index / 48;
  const u = 1 - t;
  const x = u ** 3 * 44 + 3 * u ** 2 * t * 144 + 3 * u * t ** 2 * 130 + t ** 3 * 248;
  const y = u ** 3 * 178 + 3 * u ** 2 * t * 178 + 3 * u * t ** 2 * 70 + t ** 3 * 70;
  const dx = 3 * u ** 2 * 100 - 6 * u * t * 14 + 3 * t ** 2 * 118;
  const dy = -6 * u * t * 108;
  return { t, x, y, heading: `${Math.atan2(dy, dx) * 180 / Math.PI}deg` };
});
