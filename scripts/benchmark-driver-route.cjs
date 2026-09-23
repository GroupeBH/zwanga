// Repeatable geometry-only benchmark. Not an iPhone/Android energy or native-frame measurement.
const { performance } = require('node:perf_hooks');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const load = loader();
const { createRouteAnalysisCache } = load('utils/navigation/routeAnalysis.ts');
const { getRouteAlignedPosition } = load('utils/routes/routeGeometry.ts');
const { distanceFromCoordinateToPolyline } = load('utils/navigation/routeProgress.ts');
const route = Array.from({ length: 8000 }, (_, index) => ({
  latitude: -4.32 + Math.sin(index * 0.009) * 0.006,
  longitude: 15.2 + index * 0.000025,
}));
const trace = Array.from({ length: 500 }, (_, index) => ({
  latitude: route[index + 1000].latitude + 0.00004,
  longitude: route[index + 1000].longitude,
}));
const measure = fn => { const start = performance.now(); fn(); return performance.now() - start; };
// Warm both implementations; do not count cache hits on repeated coordinates as projection savings.
const warm = createRouteAnalysisCache();
for (const fix of trace.slice(0, 30)) {
  getRouteAlignedPosition(fix, route); distanceFromCoordinateToPolyline(fix, route);
  warm.analyze(route, fix);
}
const previousMs = measure(() => {
  for (const fix of trace) { getRouteAlignedPosition(fix, route); distanceFromCoordinateToPolyline(fix, route); }
});
const cache = createRouteAnalysisCache();
const indexedMsIncludingBuild = measure(() => { for (const fix of trace) cache.analyze(route, fix); });
const stats = cache.getStats();
console.log(JSON.stringify({
  environment: 'Node.js; synthetic trace; not native/device performance',
  routePoints: route.length, gpsFixes: trace.length,
  previousMs: Math.round(previousMs), indexedMsIncludingBuild: Math.round(indexedMsIncludingBuild),
  previousSegmentProjections: trace.length * (route.length - 1) * 2,
  indexedSegmentProjections: stats.segments * 2, stats,
}, null, 2));
