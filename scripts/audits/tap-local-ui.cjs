// Use only for the explicitly confirmed local test account. Never tap stale coordinates.
const { execFileSync } = require('node:child_process');
const label = process.argv[2];
const adb = process.env.RIDE_AUDIT_ADB;
const withoutDecorativeIcon = value => value?.replace(/^[\uE000-\uF8FF], /, '').replace(/, [\uE000-\uF8FF]$/, '');
if (!adb || !label) throw Error('Explicit emulator ADB and action label required');
const run = (...args) => execFileSync(adb, ['-s', 'emulator-5554', 'shell', ...args], {
  encoding: 'utf8', timeout: 15000, windowsHide: true,
});
if (run('getprop', 'ro.kernel.qemu').trim() !== '1') throw Error('Local emulator required');
const file = `/sdcard/zwanga-audit-tap-${Date.now()}.xml`;
try {
  if (!run('uiautomator', 'dump', file).includes(file)) throw Error('Fresh hierarchy unavailable');
  const xml = run('cat', file);
  const candidates = [...xml.matchAll(/<node\s[^>]*>/g)].map(x => x[0]).filter(x =>
    x.includes('package="com.zwanga"') && x.includes('clickable="true"') && x.includes('enabled="true"') &&
    (withoutDecorativeIcon(x.match(/content-desc="([^"]*)"/)?.[1]) === label || x.match(/text="([^"]*)"/)?.[1] === label));
  if (candidates.length !== 1) throw Error('Expected exactly one enabled action; refusing blind tap');
  const b = candidates[0].match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);
  if (!b || +b[3] <= +b[1] || +b[4] <= +b[2]) throw Error('Action is not visible');
  run('input', 'tap', String(Math.round((+b[1] + +b[3]) / 2)), String(Math.round((+b[2] + +b[4]) / 2)));
  console.log(JSON.stringify({ tapped: label }));
} finally { run('rm', '-f', file); }
