// Local Android emulator only. Restores the system font even if the probe fails.
const { execFileSync } = require('node:child_process');
const { inspect, evaluate, capture } = require('./mobile-runtime-probe.cjs');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function verifyLargeText() {
  const adb = process.env.RIDE_AUDIT_ADB;
  if (!adb) throw Error('RIDE_AUDIT_ADB required');
  const command = args => execFileSync(adb, ['-s', 'emulator-5554', ...args], { encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (command(['shell', 'getprop', 'ro.kernel.qemu']).trim() !== '1') throw Error('Emulator required');
  const runtime = await inspect();
  if (!runtime.development || !runtime.localApi || !runtime.authenticated) throw Error('Authenticated local development runtime required');
  const previous = command(['shell', 'settings', 'get', 'system', 'font_scale']).trim();
  if (!/^\d+(\.\d+)?$/.test(previous)) throw Error('Unknown initial font scale');
  const read = `(() => { const rn = [...globalThis.__r.getModules().values()].find(m => m.verboseName?.endsWith('react-native/index.js'))?.publicModule.exports;
    return { fontScale: rn?.Dimensions.get('window').fontScale, cap: rn?.Text.defaultProps?.maxFontSizeMultiplier }; })()`;
  try {
    command(['shell', 'settings', 'put', 'system', 'font_scale', '2.0']);
    await pause(3000);
    // A configuration change can leave two Expo dev navigation containers alive.
    // Reload JS (not a force-stop, no account or local data is cleared).
    try { await evaluate(`(() => { const rn = [...globalThis.__r.getModules().values()].find(m => m.verboseName?.endsWith('react-native/index.js'))?.publicModule.exports; rn?.DevSettings.reload(); return true; })()`); } catch { /* Runtime is restarting. */ }
    await pause(12000);
    let evidence;
    for (let attempt = 0; attempt < 6; attempt++) {
      try { evidence = await evaluate(read); if (evidence?.fontScale === 2 && evidence.cap === 2) break; } catch { /* Native startup. */ }
      await pause(3000);
    }
    if (evidence?.fontScale !== 2 || evidence.cap !== 2) throw Error('200 percent runtime not confirmed');
    await pause(6000);
    return { ...evidence, ...capture('voice-font-home-200-confirmed', { screenshotOnly: true }) };
  } finally {
    command(['shell', 'settings', 'put', 'system', 'font_scale', previous]);
  }
}
if (require.main === module) verifyLargeText().then(result => console.log(JSON.stringify(result)))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { verifyLargeText };
