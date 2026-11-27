/* global __dirname */
// Local emulator inspection only. No backend mutations or automatic button traversal.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { inspect, evaluate, findModule } = require('./mobile-runtime-probe.cjs');
const adb = process.env.RIDE_AUDIT_ADB;
const output = path.resolve(__dirname, '../../.expo/native-screen-recette-2026-11-27.json');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const shell = (...args) => execFileSync(adb, ['-s', 'emulator-5554', 'shell', ...args], {
  encoding: 'utf8', timeout: 15000, windowsHide: true,
});
const safeRoute = route => route.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id');
const queries = () => evaluate(`(()=>{const s=${findModule('store/index.ts')}.store.getState();
  return Object.values(s).filter(v=>v?.queries).flatMap(v=>Object.values(v.queries).map(q=>({
    endpoint:q.endpointName,status:q.status,error:q.error?.status,
    started:q.startedTimeStamp,finished:q.fulfilledTimeStamp})));})()`);
async function snapshot(route, started) {
  const remote = `/sdcard/zwanga-recette-${Date.now()}.xml`;
  let xml;
  try {
    if (!shell('uiautomator', 'dump', remote).includes(remote)) throw Error('No fresh hierarchy');
    xml = shell('cat', remote);
  } finally { shell('rm', '-f', remote); }
  const nodes = [...xml.matchAll(/<node\b[^>]*>/g)].map(m => Object.fromEntries(
    [...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])));
  // Never persist names, form values, conversation content, tokens or request arguments.
  const buttons = nodes.filter(n => n.package === 'com.zwanga' && n.clickable === 'true');
  const mountedPath = await evaluate(`${findModule('node_modules/expo-router/build/global-state/router-store.js')}.store.getRouteInfo().pathname`);
  const systemDialog = nodes.some(n => /permissioncontroller/.test(n.package || ''));
  const summary = {
    at: new Date().toISOString(), route: safeRoute(route),
    mountedPath: safeRoute(mountedPath || ''), systemDialog,
    nativeHierarchy: true, buttonCount: buttons.length,
    disabledButtonCount: buttons.filter(n => n.enabled !== 'true').length,
    unlabeledButtonCount: buttons.filter(n => !n['content-desc'] && !n.text).length,
    fields: nodes.filter(n => n.class === 'android.widget.EditText').length,
    loading: nodes.some(n => /Chargement/.test(n['content-desc'] || n.text || '')),
    issues: [...new Set(nodes.map(n => n.text || '').filter(t =>
      /^(Impossible de|Une erreur|Aucun |Aucune |Aucun[e]? |Fiche conducteur indisponible|Connexion requise|Session expirée|Réessayer|Erreur|Échec|Introuvable|Indisponible)/.test(t)))]
      .map(t => t.replace(/\b\d{6,}\b/g, '[masqué]').slice(0, 160)),
    reads: (await queries()).filter(q => q.started >= started).map(q => ({
      endpoint:q.endpoint,status:q.status,...(q.error ? {error:q.error} : {}),
      ...(q.finished && q.finished >= q.started ? {ms:q.finished-q.started}:{}),
    })),
  };
  const existing = fs.existsSync(output) ? JSON.parse(fs.readFileSync(output, 'utf8')) : [];
  existing.push(summary); fs.writeFileSync(output, JSON.stringify(existing, null, 2));
  console.log(JSON.stringify(summary));
  if (systemDialog) throw Error('System permission dialog: manual observation required before continuing');
}
async function main() {
  if (!adb || shell('getprop', 'ro.kernel.qemu').trim() !== '1') throw Error('Explicit local emulator required');
  const runtime = await inspect();
  if (!runtime.development || !runtime.localApi || !runtime.authenticated) throw Error('Authenticated local development session required');
  const routes = process.argv.slice(2);
  if (!routes.length) throw Error('Explicit screen routes required');
  for (const route of routes) {
    if (!/^\/[a-z0-9/()_?=&.-]+$/i.test(route) || route.includes('://') || route.includes('..')) throw Error('Invalid internal route');
    // RTK timestamps use the device clock, which may drift from the host clock.
    const started = await evaluate('Date.now()');
    await evaluate(`${findModule('node_modules/expo-router/build/exports.js')}.router.navigate(${JSON.stringify(route)});true`);
    await pause(1700);
    await snapshot(route, started);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
