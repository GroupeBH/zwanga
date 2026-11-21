// Default: read-only evidence from the local development app, without credentials or identity.
// Explicit prepare-gps mode: temporary 20-second native GPS fixture for emulator tests only.
const { inspect, evaluate } = require('./mobile-runtime-probe.cjs');
const { execFileSync } = require('node:child_process');

async function verifyLocationRuntime() {
  const runtime = await inspect();
  if (!runtime.development || !runtime.localApi) throw Error('Verified local development runtime required');
  const key = '__zwangaLocationAudit' + Date.now();
  await evaluate(`(() => { try {
    globalThis[${JSON.stringify(key)}] = { pending: true };
    const modules = [...globalThis.__r.getModules().values()];
    const read = fn => Promise.resolve().then(fn).catch(error => ({ readError: error?.name || 'Error' }));
    const exportsOf = name => modules.find(m => m.verboseName === name)?.publicModule.exports;
    const store = exportsOf('store/index.ts')?.store;
    const state = store?.getState();
    const location = modules.find(m => m.verboseName?.endsWith('expo-location/build/Location.js'))?.publicModule.exports;
    const rn = modules.find(m => m.verboseName?.endsWith('react-native/index.js'))?.publicModule.exports;
    const bridge = rn?.NativeModules?.ZwangaDriverAlerts;
    const userId = state?.auth?.user?.id;
    Promise.all([
      location ? read(() => location.getForegroundPermissionsAsync()) : null,
      location ? read(() => location.getBackgroundPermissionsAsync()) : null,
      location ? read(() => location.hasServicesEnabledAsync()) : null,
      bridge?.getFullScreenStatus && userId ? read(() => bridge.getFullScreenStatus(userId)) : null,
    ]).then(([foreground, background, servicesEnabled, fullScreen]) => {
      if (!globalThis[${JSON.stringify(key)}]) return;
      globalThis[${JSON.stringify(key)}] = { pending: false, evidence: {
      active: rn?.AppState?.currentState,
      authenticated: !!state?.auth?.accessToken,
      role: state?.auth?.user?.role,
      locationModule: !!location,
      servicesEnabled,
      foregroundGranted: foreground?.granted,
      backgroundGranted: background?.granted,
      canAskForegroundAgain: foreground?.canAskAgain,
      fullScreen,
      loadedPicker: !!exportsOf('hooks/location-picker/useLocationPicker.ts')?.useLocationPicker,
      loadedRecovery: !!exportsOf('hooks/location-picker/useLocationRecovery.ts')?.useLocationRecovery,
      loadedPermissionReturn: !!exportsOf('hooks/usePermissionReturn.ts')?.usePermissionReturn,
      queries: Object.values(state || {}).filter(v => v?.queries).flatMap(v => Object.values(v.queries)
        .map(q => ({ endpoint: q.endpointName, status: q.status, error: q.error?.status }))),
      } };
    });
    return true;
  } catch (error) { globalThis[${JSON.stringify(key)}] = { pending: false, evidence: { probeError: error?.name || 'Error' } }; } })()`);
  try {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const result = await evaluate(`globalThis[${JSON.stringify(key)}]`);
      if (result && !result.pending) return { localApi: true, ...result.evidence };
      await new Promise(resolve => setTimeout(resolve, 150));
    }
    throw Error('Native location status timed out');
  } finally { await evaluate(`delete globalThis[${JSON.stringify(key)}]`); }
}

module.exports = { verifyLocationRuntime };
async function prepareGpsFixture() {
  const adb = process.env.RIDE_AUDIT_ADB;
  if (!adb || execFileSync(adb, ['-s', 'emulator-5554', 'shell', 'getprop', 'ro.kernel.qemu'],
    { encoding: 'utf8', timeout: 5000, windowsHide: true }).trim() !== '1') {
    throw Error('Explicit local emulator required for the GPS fixture');
  }
  const runtime = await inspect();
  if (!runtime.development || !runtime.localApi) throw Error('Verified local development runtime required');
  return evaluate(`(() => {
    const location = [...globalThis.__r.getModules().values()].find(m => m.verboseName?.endsWith('expo-location/build/Location.js'))?.publicModule.exports;
    if (!location || globalThis.__zwangaGpsFixture) return false;
    const fixture = { active: true, watch: null }; globalThis.__zwangaGpsFixture = fixture;
    const stop = () => { fixture.active = false; fixture.watch?.remove(); if (globalThis.__zwangaGpsFixture === fixture) delete globalThis.__zwangaGpsFixture; };
    setTimeout(stop, 20000);
    location.watchPositionAsync({ accuracy: 4, timeInterval: 1000 }, () => {})
      .then(watch => { fixture.watch = watch; if (!fixture.active) watch.remove(); }).catch(stop);
    return true;
  })()`);
}
if (require.main === module) (process.argv[2] === 'prepare-gps' ? prepareGpsFixture() : verifyLocationRuntime()).then(value => console.log(JSON.stringify(value)))
  .catch(error => { console.error(error.message); process.exitCode = 1; });
