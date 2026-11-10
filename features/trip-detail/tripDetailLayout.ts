/** Keep loading and native-map heights identical to avoid a jump at mount. */
export function tripDetailMapHeight(viewportHeight: number, isTripDriver: boolean) {
  const height = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 700;
  return isTripDriver ? Math.min(270, Math.max(200, height * 0.28)) : Math.min(214, Math.max(172, height * 0.27));
}
