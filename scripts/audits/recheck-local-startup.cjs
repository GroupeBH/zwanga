/* global __dirname */
// Explicit emulator-only reproduction. No account mutation, clear-data or log clearing.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { inspect } = require('./mobile-runtime-probe.cjs');
const mode = process.argv[2] || 'all';
if (!['all', 'resume'].includes(mode)) throw Error('Choose all or resume');
const adb = process.env.RIDE_AUDIT_ADB, serial = process.env.RIDE_AUDIT_SERIAL || 'emulator-5554';
if (!adb || !/^emulator-\d+$/.test(serial)) throw Error('Explicit local emulator required');
const run = (...args) => execFileSync(adb, ['-s', serial, ...args], {
  encoding: 'utf8', timeout: 25000, windowsHide: true, maxBuffer: 4 * 1024 * 1024,
});
const shell = (...args) => run('shell', ...args);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const output = path.resolve(__dirname, '../../.expo/recheck-startup-20261103' + (mode === 'resume' ? '-resume' : ''));
const report = { scope: 'existing local dev build, not release or physical device', mode, steps: [] };
const events = () => run('logcat', '-b', 'events', '-d', '-v', 'epoch', '-s', 'am_anr:I', 'am_crash:I')
  .split(/\r?\n/).filter(line => /\bcom\.zwanga(?:,|\])/.test(line));
async function observe(label, baseline) {
  shell('uiautomator', 'dump', '/sdcard/recheck-startup.xml');
  const xml = shell('cat', '/sdcard/recheck-startup.xml');
  fs.writeFileSync(path.join(output, label + '.xml'), xml);
  fs.writeFileSync(path.join(output, label + '.png'), execFileSync(adb,
    ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 15000, windowsHide: true, maxBuffer: 12 * 1024 * 1024 }));
  const newEvents = events().filter(line => !baseline.has(line));
  const runtime = await inspect().catch(() => null);
  const result = { label, anrDialog: /isn.t responding|not responding|ne répond pas/i.test(xml),
    newAnr: newEvents.filter(line => line.includes('am_anr')).length,
    newCrash: newEvents.filter(line => line.includes('am_crash')).length,
    runtimeAvailable: !!runtime, localApi: runtime?.localApi === true,
    authenticated: runtime?.authenticated === true,
    appVisible: xml.includes('package="com.zwanga"'),
    errorScreen: /Maximum update depth|Render Error|Unable to resolve module/.test(xml) };
  report.steps.push(result); console.log(JSON.stringify(result));
  fs.writeFileSync(path.join(output, 'new-events.log'), newEvents.join('\n'));
  if (result.anrDialog || result.newAnr || result.newCrash || result.errorScreen || !result.localApi || !result.authenticated || !result.appVisible)
    throw Error('Local startup/resume not validated: ' + label);
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const runtime = await inspect();
  if (!runtime.development || !runtime.localApi) throw Error('Verified local dev runtime required before restarting');
  if (shell('getprop', 'ro.kernel.qemu').trim() !== '1') throw Error('Emulator required');
  const baseline = new Set(events());
  fs.writeFileSync(path.join(output, 'events-before.log'), [...baseline].join('\n'));
  shell('input', 'keyevent', 'KEYCODE_WAKEUP'); shell('wm', 'dismiss-keyguard');
  for (let n = 1; mode === 'all' && n <= 3; n++) {
    shell('am', 'force-stop', 'com.zwanga');
    const launch = shell('am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d',
      'exp+zwanga-app://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081', 'com.zwanga');
    fs.writeFileSync(path.join(output, `cold-${n}-launch.log`), launch);
    await sleep(12000);
    await observe('cold-' + n, baseline);
  }
  for (let n = 1; n <= 3; n++) {
    shell('input', 'keyevent', 'KEYCODE_HOME'); await sleep(3000);
    shell('am', 'start', '-n', 'com.zwanga/.MainActivity'); await sleep(5000);
    await observe('resume-' + n, baseline);
  }
  report.completed = true;
})().catch(error => {
  report.completed = false; report.error = error.message; console.error(error.message); process.exitCode = 1;
}).finally(() => {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
});
