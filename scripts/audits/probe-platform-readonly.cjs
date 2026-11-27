/* global __dirname, Buffer */
// Bounded loopback GET checks. Never record credentials, response bodies or IDs.
const fs = require('node:fs');
const path = require('node:path');
const { inspect, evaluate, findModule } = require('./mobile-runtime-probe.cjs');
const endpoints = ['/me/activity', '/trips/my-trips?scope=activity',
  '/trips/my-trips?scope=activity&view=compact',
  '/trips/my-trips/history?limit=30', '/bookings/my-bookings?scope=activity',
  '/bookings/my-bookings/history?limit=30', '/zwanga-pro/commerce/categories',
  '/zwanga-pro/commerce/products?limit=20', '/zwanga-pro/mine?limit=25'];
let stage = 'local-runtime';
(async () => {
  const state = await inspect();
  if (!state.development || !state.localApi || !state.authenticated) throw Error('local_session_required');
  stage = 'session';
  const token = await evaluate(`(()=>${findModule('store/index.ts')}?.store?.getState()?.auth?.accessToken)()`);
  if (!token) throw Error('no_local_session');
  stage = 'bounded-reads';
  const results = [];
  for (let round = 1; round <= 3; round++) for (const endpoint of endpoints) {
    const start = performance.now();
    try {
      const response = await fetch('http://127.0.0.1:5200/api/v1' + endpoint, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: 'Bearer ' + token },
      });
      const body = await response.text();
      let count;
      try {
        const parsed = JSON.parse(body);
        const items = Array.isArray(parsed) ? parsed : parsed.items ?? parsed.data;
        if (Array.isArray(items)) count = items.length;
      } catch { /* Status and byte count remain diagnostic; no body logged. */ }
      results.push({ round, endpoint, status: response.status, ms: Math.round(performance.now() - start), bytes: Buffer.byteLength(body), ...(count === undefined ? {} : { count }) });
    } catch { results.push({ round, endpoint, status: 'transport_error', ms: Math.round(performance.now() - start) }); }
  }
  const report = { date: new Date().toISOString(), scope: `${endpoints.length * 3} sequential localhost GETs; not a load or production test`, results };
  stage = 'report';
  fs.writeFileSync(path.resolve(__dirname, '../../.expo/platform-readonly-corrections-2026-11-27.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(() => { console.error(JSON.stringify({ failedStage: stage })); process.exitCode = 1; });
