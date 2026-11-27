/* global __dirname */
// Explicit, reviewed actions on the local emulator. No blind traversal or payment automation.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { inspect, evaluate, findModule } = require('./mobile-runtime-probe.cjs');
const adb = 'C:/Users/hp/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const file = path.resolve(__dirname, '../../.expo/native-actions-2026-11-27.json');
const shell = (...args) => execFileSync(adb, ['-s', 'emulator-5554', 'shell', ...args], {
  encoding: 'utf8', timeout: 15000, windowsHide: true,
});
const decode = s => s.replaceAll('&apos;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&')
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
const label = n => decode(n['content-desc'] || n.text || '').replace(/[\uE000-\uF8FF]/g, '').replace(/^,\s*|,\s*$/g, '').trim();
function hierarchy() {
  const target = `/sdcard/zwanga-action-check-${Date.now()}.xml`;
  try {
    if (!shell('uiautomator', 'dump', target).includes(target)) throw Error('FRESH_HIERARCHY_REQUIRED');
    const xml = shell('cat', target);
    return [...xml.matchAll(/<node\b[^>]*>/g)].map(m => Object.fromEntries(
      [...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])));
  } finally { shell('rm', '-f', target); }
}
function select(nodes, expected, input = false, occurrence) {
  const matches = nodes.filter(n => n.package === 'com.zwanga' && label(n) === expected &&
    (input ? n.class === 'android.widget.EditText' : n.clickable === 'true' && n.enabled === 'true'));
  // An explicit index is allowed only for repeated, read-only payment-detail controls.
  if (occurrence !== undefined && (expected !== 'Voir le détail du paiement' || input ||
    !Number.isInteger(occurrence) || occurrence < 0 || !matches[occurrence])) throw Error('REVIEWED_OCCURRENCE_REQUIRED');
  if (occurrence === undefined && matches.length !== 1) throw Error('UNIQUE_VISIBLE_CONTROL_REQUIRED');
  const b = matches[occurrence ?? 0].bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/).slice(1).map(Number);
  if (b[2] <= b[0] || b[3] <= b[1]) throw Error('CONTROL_NOT_VISIBLE');
  return [String(Math.round((b[0] + b[2]) / 2)), String(Math.round((b[1] + b[3]) / 2))];
}
function adjacentSwitch(nodes, expected) {
  const labels = nodes.map((n, index) => ({ n, index })).filter(({ n }) => n.package === 'com.zwanga' && label(n) === expected);
  if (labels.length !== 1) throw Error('UNIQUE_SWITCH_LABEL_REQUIRED');
  const { n, index } = labels[0];
  const control = nodes[index + 1];
  if (control?.class !== 'android.widget.Switch' || control.package !== 'com.zwanga' || control.enabled !== 'true') throw Error('ADJACENT_SWITCH_REQUIRED');
  const bounds = v => v.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/).slice(1).map(Number);
  const a = bounds(n), b = bounds(control);
  if (Math.max(a[1], b[1]) >= Math.min(a[3], b[3]) || b[2] <= b[0]) throw Error('SWITCH_ROW_NOT_VISIBLE');
  return { point: [String(Math.round((b[0] + b[2]) / 2)), String(Math.round((b[1] + b[3]) / 2))], checked: control.checked === 'true' };
}
function reviewedServiceRefresh(nodes, expected) {
  // RN exposes this ServiceButton as "busy" instead of its visible label.
  // Restrict the workaround to this read-only action and freshly verified bounds.
  if (expected !== 'Actualiser mes dossiers') throw Error('REVIEWED_READ_ONLY_TEXT_REQUIRED');
  const targets = nodes.filter(n => n.package === 'com.zwanga' && n.text === expected);
  if (targets.length !== 1) throw Error('UNIQUE_VISIBLE_TEXT_REQUIRED');
  const bounds = n => n.bounds.match(/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/).slice(1).map(Number);
  const t = bounds(targets[0]);
  const parents = nodes.filter(n => n.package === 'com.zwanga' && n.clickable === 'true' && n.enabled === 'true')
    .filter(n => { const b = bounds(n); return b[0] <= t[0] && b[1] <= t[1] && b[2] >= t[2] && b[3] >= t[3] && b[3] - b[1] < 250; });
  if (parents.length !== 1) throw Error('UNIQUE_ENABLED_CONTAINER_REQUIRED');
  return [String(Math.round((t[0] + t[2]) / 2)), String(Math.round((t[1] + t[3]) / 2))];
}
async function run(steps) {
  const runtime = await inspect();
  if (!runtime.development || !runtime.localApi || !runtime.authenticated || shell('getprop', 'ro.kernel.qemu').trim() !== '1') {
    throw Error('AUTHENTICATED_LOCAL_EMULATOR_REQUIRED');
  }
  for (const step of steps) {
    const start = await evaluate('Date.now()');
    const entry = { at: new Date().toISOString(), id: step.id, action: step.action, expected: step.expected || step.disabled || '', result: 'failed' };
    try {
      if (step.action === 'navigate' || step.action === 'replace') {
        if (!/^\/[a-z0-9/()_?=&.-]*$/i.test(step.route) || step.route.includes('..')) throw Error('INTERNAL_ROUTE_REQUIRED');
        await evaluate(`${findModule('node_modules/expo-router/build/exports.js')}.router.${step.action}(${JSON.stringify(step.route)});true`);
      } else if (step.action === 'warmLink') {
        if (!/^zwanga:\/\/incoming-driver(?:\?kind=(?:booking|dispatch))?$/.test(step.link)) throw Error('REVIEWED_MISSING_ID_LINK_REQUIRED');
        shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', step.link, '-p', 'com.zwanga');
      } else if (step.action === 'tap') {
        shell('input', 'tap', ...select(hierarchy(), step.label, false, step.occurrence));
      } else if (step.action === 'tapServiceRefreshText') {
        shell('input', 'tap', ...reviewedServiceRefresh(hierarchy(), step.label));
      } else if (step.action === 'toggle') {
        shell('input', 'tap', ...adjacentSwitch(hierarchy(), step.label).point);
      } else if (step.action === 'type') {
        if (!/^[a-z0-9 .:_-]{1,300}$/i.test(step.text)) throw Error('SYNTHETIC_ASCII_INPUT_REQUIRED');
        shell('input', 'tap', ...select(hierarchy(), step.label, true));
        // Wait for the native input to own focus: otherwise keyboard shortcuts can reload a dev build.
        await new Promise(resolve => setTimeout(resolve, 300));
        if (!hierarchy().some(n => n.package === 'com.zwanga' && n.class === 'android.widget.EditText' &&
          n.focused === 'true' && label(n) === step.label)) throw Error('INPUT_FOCUS_REQUIRED');
        shell('input', 'text', step.text.replaceAll(' ', '%s'));
        await evaluate(`${findModule('node_modules/react-native/index.js')}?.Keyboard?.dismiss();true`);
      } else if (step.action === 'back') shell('input', 'keyevent', 'BACK');
      else if (step.action === 'swipe') {
        // Scrolling only; no inferred action coordinates.
        shell('input', 'swipe', '540', step.direction === 'up' ? '650' : '1800', '540', step.direction === 'up' ? '1800' : '650', '450');
      } else if (step.action !== 'inspect') throw Error('UNKNOWN_ACTION');
      await new Promise(resolve => setTimeout(resolve, 900));
      const nodes = hierarchy();
      if (nodes.some(n => /permissioncontroller/.test(n.package || ''))) throw Error('SYSTEM_PERMISSION_DIALOG');
      const visible = nodes.map(label).join('\n');
      if (step.expected && !visible.includes(step.expected)) throw Error('EXPECTED_UI_NOT_VISIBLE');
      if (step.absent && visible.includes(step.absent)) throw Error('UNEXPECTED_UI_VISIBLE');
      if (step.expectedRoute) {
        entry.actualRoute = await evaluate(`${findModule('node_modules/expo-router/build/global-state/router-store.js')}.store.getRouteInfo().pathname`);
        if (entry.actualRoute !== step.expectedRoute) throw Error('UNEXPECTED_ROUTE');
      }
      if (typeof step.checked === 'boolean') {
        entry.checked = adjacentSwitch(nodes, step.label).checked;
        if (entry.checked !== step.checked) throw Error('UNEXPECTED_SWITCH_STATE');
      }
      if (step.disabled) {
        const controls = nodes.filter(n => label(n) === step.disabled);
        if (!controls.length || controls.some(n => n.clickable === 'true' && n.enabled === 'true')) throw Error('EXPECTED_DISABLED_CONTROL');
      }
      entry.reads = await evaluate(`(()=>{const s=${findModule('store/index.ts')}.store.getState();return Object.values(s).filter(v=>v?.queries).flatMap(v=>Object.values(v.queries)).filter(q=>q.startedTimeStamp>=${start}).map(q=>({endpoint:q.endpointName,status:q.status,error:q.error?.status}));})()`);
      entry.result = 'passed';
    } catch (e) { entry.reason = /^[A-Z_]+$/.test(e.message) ? e.message : 'ACTION_CHECK_FAILED'; }
    const all = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : [];
    all.push(entry); fs.writeFileSync(file, JSON.stringify(all, null, 2));
    console.log(JSON.stringify(entry));
    if (entry.result !== 'passed') throw Error('STOPPED_AT_' + step.id);
  }
}
module.exports = { run };
