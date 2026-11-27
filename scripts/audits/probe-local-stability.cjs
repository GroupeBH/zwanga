/* global __dirname, Buffer */
// Short, bounded local read observation; not a load test or production SLA.
const fs = require('node:fs');
const path = require('node:path');
const { inspect, evaluate, findModule } = require('./mobile-runtime-probe.cjs');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function main() {
  const runtime = await inspect();
  if (!runtime.development || !runtime.localApi || !runtime.authenticated) throw Error('LOCAL_RUNTIME_REQUIRED');
  const token = await evaluate(`${findModule('store/index.ts')}.store.getState().auth.accessToken`);
  const started = Date.now(), results = []; let consecutiveErrors = 0;
  for (let round = 1; round <= 25; round++) {
    for (const endpoint of ['/health', '/me/activity', ...(round % 5 === 0 ? ['/trips/my-trips?scope=activity&view=compact'] : [])]) {
      const at = performance.now(); let result;
      try {
        const response = await fetch('http://127.0.0.1:5200' + (endpoint === '/health' ? endpoint : '/api/v1' + endpoint), {
          method: 'GET', redirect: 'error', signal: AbortSignal.timeout(7000), headers: { Authorization: 'Bearer ' + token },
        });
        const body = await response.text();
        result = { round, endpoint, status: response.status, ms: Math.round(performance.now() - at), bytes: Buffer.byteLength(body) };
      } catch { result = { round, endpoint, status: 'transport_error', ms: Math.round(performance.now() - at) }; }
      results.push(result); consecutiveErrors = result.status === 200 ? 0 : consecutiveErrors + 1;
      if (consecutiveErrors >= 3 || result.status === 401 || result.status === 429) break;
    }
    if (consecutiveErrors >= 3 || [401, 429].includes(results.at(-1).status)) break;
    if (round < 25) await wait(5000);
  }
  const report = { at: new Date().toISOString(), durationMs: Date.now() - started, concurrentRequests: 1,
    requests: results.length, ok: results.filter(r => r.status === 200).length,
    scope: 'Local read-only observation; no payments, writes, provider calls or long-duration stability certification', results };
  fs.writeFileSync(path.resolve(__dirname, '../../.expo/local-stability-2026-11-27-verified.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, results: undefined }));
  if (report.ok !== report.requests) process.exitCode = 1;
}
main().catch(() => { console.error('Local stability probe unavailable; credentials not logged'); process.exitCode = 1; });
