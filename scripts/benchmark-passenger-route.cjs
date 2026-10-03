// Synthetic JS geometry only; not native rendering, latency or battery evidence.
const { performance } = require('node:perf_hooks');
const load = require('../tests/helpers/loadTypeScript.cjs').loader();
const { createPassengerRouteAnalysis } = load('utils/navigation/passengerRouteAnalysis.ts');
const { trimPolylineFromCurrentPosition } = load('utils/navigation/routeProgress.ts');
const { getRouteAlignedPosition } = load('utils/routes/routeGeometry.ts');
const route = Array.from({ length: 8000 }, (_, i) => ({ latitude: -4.32 + Math.sin(i * .009) * .006, longitude: 15.2 + i * .000025 }));
const trace = Array.from({ length: 500 }, (_, i) => ({ ...route[1200 + i], latitude: route[1200 + i].latitude + .00004 }));
const cache = createPassengerRouteAnalysis();
const old = fix => { getRouteAlignedPosition(fix, route, .1); trimPolylineFromCurrentPosition(fix, route, route.at(-1)); };
for (const fix of trace.slice(0, 30)) old(fix);
const time = fn => { const start = performance.now(); trace.forEach(fn); return Math.round(performance.now() - start); };
const previousMs = time(old);
const currentMsIncludingBuild = time(fix => { cache.heading(route, fix); cache.remaining(route, fix, route.at(-1)); });
console.log(JSON.stringify({ environment: 'Node.js; synthetic, not native', points: route.length,
  samples: trace.length, previousMs, currentMsIncludingBuild, stats: cache.getStats() }, null, 2));
