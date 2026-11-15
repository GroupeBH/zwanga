/* global __dirname */
// Native navigation only, no financial mutation. Requires an authenticated local dev build.
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const { inspect, evaluate, findModule, capture } = require('./mobile-runtime-probe.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const adb = process.env.RIDE_AUDIT_ADB;
const shell = (...args) => execFileSync(adb, ['-s', 'emulator-5554', 'shell', ...args], { encoding: 'utf8', timeout: 20000, windowsHide: true });
async function tapEntry() {
  for (let attempt = 0; attempt < 9; attempt++) {
    const file = '/sdcard/credit-navigation-audit.xml';
    let xml;
    try { shell('uiautomator', 'dump', file); xml = shell('cat', file); }
    finally { shell('rm', '-f', file); }
    const node = [...xml.matchAll(/<node\b[^>]*>/g)].map(m => m[0]).find(n =>
      n.includes('package="com.zwanga"') && n.includes('clickable="true"') && n.includes('enabled="true"') && n.includes('content-desc="Mes remboursements"'));
    const b = node?.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
    if (b && +b[4] - +b[2] > 35) {
      shell('input', 'tap', String(Math.round((+b[1] + +b[3]) / 2)), String(Math.round((+b[2] + +b[4]) / 2)));
      return;
    }
    const size = shell('wm', 'size').match(/(\d+)x(\d+)/);
    if (!size) throw Error('Screen size unavailable');
    shell('input', 'swipe', String(Math.round(+size[1] / 2)), String(Math.round(+size[2] * .8)),
      String(Math.round(+size[1] / 2)), String(Math.round(+size[2] * .35)), '350');
    await pause(400);
  }
  throw Error('Repayment entry not found, no blind tap performed');
}
async function main() {
  if (!adb || shell('getprop', 'ro.kernel.qemu').trim() !== '1') throw Error('Explicit emulator required');
  const state = await inspect();
  if (!state.localApi || !state.development || !state.authenticated) throw Error('Local authenticated build required');
  const results = [];
  for (const [name, route] of [['profile', '/(tabs)/profile'], ['services', '/services']]) {
    await evaluate(`${findModule('node_modules/expo-router/build/exports.js')}.router.navigate(${JSON.stringify(route)})`);
    await pause(1800);
    await tapEntry(); await pause(1000);
    const shot = capture('credit-entry-' + name);
    const xml = fs.readFileSync(path.resolve(__dirname, '../../.expo/global-e2e-ui-20261103', shot.capture + '.xml'), 'utf8');
    if (!xml.includes('Mes remboursements') || !xml.includes('Choisir un équipement ou un véhicule')) throw Error('Wrong destination');
    const query = (await inspect()).queries.find(q => q.endpoint === 'getAssetCredits');
    results.push({ origin: name, openedManagement: true, apiStatus: query?.status, apiError: query?.error });
  }
  const output = path.resolve(__dirname, '../../.expo/credit-navigation-local-2026-11-15.json');
  fs.writeFileSync(output, JSON.stringify(results, null, 2)); console.log(JSON.stringify(results));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
