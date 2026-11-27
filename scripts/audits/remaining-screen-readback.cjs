/* global __dirname */
// Local, authenticated, read-only corroboration of manually selected native actions.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Buffer } = require('node:buffer');
const { inspect, evaluate, findModule } = require('./mobile-runtime-probe.cjs');
const output = path.resolve(__dirname, '../../.expo/remaining-screen-readback-2026-11-27.json');
const state = `${findModule('store/index.ts')}.store.getState()`;
function record(id, evidence) {
  const rows = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : [];
  const row = { at: new Date().toISOString(), id, ...evidence };
  rows.push(row); fs.writeFileSync(output, JSON.stringify(rows, null, 2));
  console.log(JSON.stringify(row)); return row;
}
async function guard() {
  const runtime = await inspect();
  if (!runtime.development || !runtime.localApi || !runtime.authenticated) throw Error('LOCAL_TEST_SESSION_REQUIRED');
}
async function paymentFilter(filter) {
  await guard();
  const allowed = { all: ['succeeded', 'failed', 'cancelled', 'initiated', 'pending'],
    succeeded: ['succeeded'], pending: ['pending', 'initiated'], failed: ['failed', 'cancelled'] };
  if (!allowed[filter]) throw Error('REVIEWED_FILTER_REQUIRED');
  let result;
  for (let attempt = 0; attempt < 6; attempt++) {
    result = await evaluate(`(()=>{const q=Object.values(${state}).filter(v=>v?.queries)
      .flatMap(v=>Object.values(v.queries)).find(q=>q.endpointName==='getPaymentHistoryPage'&&q.originalArgs?.filter===${JSON.stringify(filter)});
      return {status:q?.status,error:q?.error?.status,count:q?.data?.data?.length,
        total:q?.data?.total,statuses:[...new Set((q?.data?.data||[]).map(x=>x.status))]};})()`);
    if (result.status === 'fulfilled') break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return record(`native-payment-filter-${filter}`, { ...result,
    passed: result.status === 'fulfilled' && Number.isInteger(result.count) &&
      result.statuses.every(status => allowed[filter].includes(status)) });
}
async function paymentPagination() {
  await guard();
  const token = await evaluate(`${state}.auth.accessToken`);
  const get = async route => {
    const response = await fetch(`http://127.0.0.1:5200/api/v1${route}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw Error(`LOCAL_READ_HTTP_${response.status}`);
    return response.json();
  };
  const summary = await get('/payments/history/summary');
  const results = [];
  for (const filter of ['all', 'succeeded', 'pending', 'failed']) {
    let cursor, total, pages = 0, duplicate = false, ordered = true, previous;
    const ids = new Set(); const seenCursors = new Set();
    do {
      const params = new URLSearchParams({ filter, limit: '5', ...(cursor ? { before: cursor } : {}) });
      const page = await get(`/payments/history/page?${params}`); pages++;
      if (!Array.isArray(page.data) || pages > 50) throw Error('UNEXPECTED_PAGE_SHAPE');
      total = page.total;
      for (const item of page.data) {
        duplicate ||= ids.has(item.id); ids.add(item.id);
        if (previous && Date.parse(item.createdAt) > Date.parse(previous.createdAt)) ordered = false;
        previous = item;
      }
      cursor = page.nextCursor;
      if (cursor && seenCursors.has(cursor)) throw Error('REPEATING_CURSOR');
      if (cursor) seenCursors.add(cursor);
    } while (cursor);
    results.push({ filter, pages, count: ids.size, total, duplicate, ordered,
      passed: !duplicate && ordered && ids.size === total });
  }
  return record('api-payment-pagination', { results, summaryMatches: results[0].count === summary.total,
    passed: results.every(result => result.passed) && results[0].count === summary.total, mutations: false });
}
async function receipt() {
  await guard();
  // Hermes uses a JS Promise polyfill that CDP awaitPromise does not unwrap.
  await evaluate(`(()=>{const f=${findModule('node_modules/expo-file-system/legacy.ts')};
    const dir=f.documentDirectory||f.cacheDirectory;globalThis.__zwangaReceiptAudit={done:false};
    f.readDirectoryAsync(dir).then(names=>Promise.all(names.filter(n=>n.startsWith('zwanga-paiement-')&&n.endsWith('.pdf'))
      .map(n=>f.getInfoAsync(dir+n).then(info=>({n,info}))))).then(receipts=>{
      receipts.sort((a,b)=>b.info.modificationTime-a.info.modificationTime);
      if(!receipts[0]||Date.now()/1000-receipts[0].info.modificationTime>3600) throw Error('RECENT_RECEIPT_REQUIRED');
      return f.readAsStringAsync(dir+receipts[0].n,{encoding:'base64'});
    }).then(value=>{globalThis.__zwangaReceiptAudit={done:true,value}})
      .catch(()=>{globalThis.__zwangaReceiptAudit={done:true,error:true}});return true;})()`);
  let result;
  try {
    for (let n = 0; n < 15; n++) {
      result = await evaluate('globalThis.__zwangaReceiptAudit');
      if (result?.done) break;
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  } finally { await evaluate('delete globalThis.__zwangaReceiptAudit'); }
  if (!result?.done || result.error) throw Error('RECEIPT_READ_FAILED');
  const pdf = result.value;
  const bytes = Buffer.from(pdf, 'base64');
  const destination = path.resolve(__dirname, '../../.expo/remaining-receipt-private.pdf');
  fs.writeFileSync(destination, bytes);
  return record('native-receipt-file', { bytes: bytes.length,
    validHeader: bytes.subarray(0, 5).toString() === '%PDF-',
    digest: crypto.createHash('sha256').update(bytes).digest('hex'), mutations: false });
}
async function profileDigest() {
  await guard();
  // Only a digest leaves memory: no names, phone numbers or identifiers in the report.
  const token = await evaluate(`${state}.auth.accessToken`);
  const response = await fetch('http://127.0.0.1:5200/api/v1/users/me', {
    headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw Error('PROFILE_REQUIRED');
  const { user: u } = await response.json();
  const value = JSON.stringify([u.id,u.firstName,u.lastName,u.phone,u.gender,u.driverCategory,u.role]);
  return record('profile-fields-digest', { schema: 2, excludedTemporaryPhotoUrl: true,
    digest: crypto.createHash('sha256').update(value).digest('hex') });
}
module.exports = { paymentFilter, paymentPagination, receipt, profileDigest, record };
if (require.main === module) {
  const commands = { pagination: paymentPagination, receipt, profile: profileDigest };
  const command = commands[process.argv[2]];
  if (!command) throw Error('REVIEWED_COMMAND_REQUIRED');
  command().catch(error => { console.error(/^[A-Z_0-9]+$/.test(error.message) ? error.message : 'READBACK_FAILED'); process.exitCode = 1; });
}
