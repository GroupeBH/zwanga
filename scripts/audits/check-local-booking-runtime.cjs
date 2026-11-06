// Read-only requests through the currently connected emulator's real RTK layer.
// Session tokens stay inside Hermes. No signup, SMS, notification or payment.
const { inspect, evaluate, findModule } = require('./mobile-runtime-probe.cjs');
(async () => {
  const runtime = await inspect();
  if (!runtime.development || !runtime.localApi || !runtime.authenticated)
    throw Error('Authenticated local development runtime required');
  await evaluate(`(() => {
    const store = ${findModule('store/index.ts')}.store;
    const api = ${findModule('store/api/baseApi.ts')}.baseApi;
    const names = ['getProfileSummary', 'getKycStatus', 'getAppUpdate'];
    const queries = store.getState()[api.reducerPath]?.queries || {};
    globalThis.__zwangaBookingAuditReads = null;
    Promise.all(names.map(name => {
      const previous = Object.values(queries).find(q => q.endpointName === name);
      if (!api.endpoints[name] || (name === 'getAppUpdate' && !previous?.originalArgs))
        return { endpoint: name, tested: false };
      const started = Date.now();
      return store.dispatch(api.endpoints[name].initiate(previous?.originalArgs,
        { subscribe: false, forceRefetch: true })).then(result => ({
          endpoint: name, status: result.status, error: result.error?.status,
          elapsedMs: Date.now() - started,
        }));
    })).then(rows => { globalThis.__zwangaBookingAuditReads = rows; });
    return { started: true };
  })()`);
  let result;
  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    result = await evaluate('globalThis.__zwangaBookingAuditReads');
    if (Array.isArray(result)) break;
  }
  await evaluate('delete globalThis.__zwangaBookingAuditReads');
  if (!Array.isArray(result)) throw Error('Read-only runtime requests did not finish within 25 seconds');
  console.log(JSON.stringify({ scope: 'local emulator read-only RTK HTTP', results: result }));
})().catch(error => { console.error(error.message); process.exitCode = 1; });
