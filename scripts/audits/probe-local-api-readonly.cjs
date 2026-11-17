/* global __dirname */
// Read-only availability probe using the existing local dev session. No tokens or bodies logged.
const fs = require('node:fs');
const path = require('node:path');
const { evaluate, findModule, inspect } = require('./mobile-runtime-probe.cjs');
const endpoints = ['/users/me', '/users/kyc/status', '/vehicles', '/trips/my-trips',
  '/bookings/my-bookings', '/trip-requests/pages/available?limit=5',
  '/pro-services/catalogue', '/pro-services/mine', '/pro-services/mine/current-documents',
  '/partners/me/organizations', '/partners/fleet-assignments/mine', '/partners/fleet-assignments/history',
  '/asset-credits/mine', '/asset-credits/requests'];
(async () => {
  const state = await inspect();
  if (!state.development || !state.localApi || !state.authenticated) throw Error('Authenticated local development runtime required');
  const session = await evaluate(`(()=>{const state=${findModule('store/index.ts')}?.store?.getState();return {token:state?.auth?.accessToken};})()`);
  if (!session?.token) throw Error('No local session');
  const results = [];
  for (const endpoint of endpoints) {
    const started = Date.now();
    try {
      const response = await fetch('http://127.0.0.1:5200/api/v1' + endpoint, {
        method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Bearer ' + session.token },
      });
      const body = await response.json();
      const data = body?.data ?? body;
      results.push({ endpoint, status: response.status, durationMs: Date.now() - started,
        shape: Array.isArray(data) ? 'array' : typeof data,
        ...(Array.isArray(data) ? { count: data.length } : {}),
        ...(response.ok ? {} : { code: typeof body?.code === 'string' ? body.code : undefined }) });
    } catch { results.push({ endpoint, status: 'transport_or_format_error', durationMs: Date.now() - started }); }
  }
  const report = { timestamp: new Date().toISOString(), method: 'GET', results };
  const historyPath = path.resolve(__dirname, '../../.expo/local-api-readonly-20261114-history.json');
  const history = fs.existsSync(historyPath) ? JSON.parse(fs.readFileSync(historyPath, 'utf8')) : [];
  history.push(report);
  fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  fs.writeFileSync(path.resolve(__dirname, '../../.expo/local-api-readonly-20261114.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
})().catch(() => { console.error('Local read-only probe unavailable; no credentials logged'); process.exitCode = 1; });
