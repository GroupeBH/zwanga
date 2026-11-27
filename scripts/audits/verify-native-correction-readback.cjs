/* global __dirname */
// Read-only verification of the synthetic ticket submitted through the local emulator.
const fs = require('node:fs');
const path = require('node:path');
const { inspect, evaluate, findModule } = require('./mobile-runtime-probe.cjs');
async function main() {
  const runtime = await inspect();
  if (!runtime.development || !runtime.localApi || !runtime.authenticated) throw Error('LOCAL_TEST_REQUIRED');
  const health = await fetch('http://127.0.0.1:5200/health', { signal: AbortSignal.timeout(5000) });
  const token = await evaluate(`${findModule('store/index.ts')}.store.getState().auth.accessToken`);
  const query = new URLSearchParams({ page: '1', limit: '100', search: 'test local 20261127 fixes' });
  const response = await fetch('http://127.0.0.1:5200/api/v1/support/tickets?' + query, {
    headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000),
  });
  let body = await response.json();
  if (!Array.isArray(body?.data) && body?.data) body = body.data;
  if (!Array.isArray(body?.data)) throw Error('UNEXPECTED_RESPONSE');
  const matching = body.data.filter(item => item.subject === 'test local 20261127 fixes');
  const report = { at: new Date().toISOString(), health: health.status, status: response.status,
    matchingTickets: matching.length, filteredTotal: body.meta?.total, states: matching.map(item => item.status),
    categories: matching.map(item => item.category), mutationPerformedByProbe: false };
  fs.writeFileSync(path.resolve(__dirname, '../../.expo/native-correction-readback-2026-11-27.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
  if (health.status !== 200 || response.status !== 200 || matching.length !== 1 || body.meta?.total !== 1) {
    throw Error('UNIQUE_SYNTHETIC_TICKET_NOT_CONFIRMED');
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
