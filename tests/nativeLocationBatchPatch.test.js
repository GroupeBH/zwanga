const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { marker, patchTaskManager, patchLocationConsumer, patchLocationNumbers } = require('../scripts/patch-expo-location-batches.cjs');
const javaSource = () => fs.readFileSync('node_modules/expo-task-manager/android/src/main/java/expo/modules/taskManager/TaskManagerUtils.java', 'utf8');
const kotlinSource = () => fs.readFileSync('node_modules/expo-location/android/src/main/java/expo/modules/location/taskConsumers/LocationTaskConsumer.kt', 'utf8');

test('restored interval coerces Integer or Long through Number and the patch remains idempotent', () => {
  const source = fs.readFileSync('node_modules/expo-location/android/src/main/java/expo/modules/location/records/LocationArguments.kt', 'utf8');
  assert.match(source, /timeInterval = \(map\["timeInterval"\] as\? Number\)\?\.toLong\(\)/);
  assert.equal(patchLocationNumbers(source), source);
  const original = source.replace('(map["timeInterval"] as? Number)?.toLong()', 'map["timeInterval"] as? Long');
  assert.equal(patchLocationNumbers(original), source);
  assert.throws(() => patchLocationNumbers('unknown upstream'), /source changed/);
});

test('native GPS patch is installed, idempotent and rejects changed upstream sources', () => {
  assert(javaSource().includes(marker)); assert(kotlinSource().includes(marker));
  assert.equal(patchTaskManager(javaSource()), javaSource());
  assert.equal(patchLocationConsumer(kotlinSource()), kotlinSource());
  assert.throws(() => patchTaskManager('unknown version'), /source changed/);
  assert.throws(() => patchLocationConsumer('unknown version'), /source changed/);
  const pkg = require('../package.json');
  assert.match(pkg.scripts.postinstall, /patch-expo-location-batches/);
  assert.deepEqual(pkg.expo.autolinking.android.buildFromSource, ['expo-location', 'expo-task-manager', 'unimodules-app-loader'],
    'patched GPS modules must not be replaced by precompiled Expo AARs');
  const kotlin = kotlinSource();
  assert.match(kotlin, /mDeferredLocations\.size >= maxDeferredSamples/);
  assert(!kotlin.includes('mDeferredLocations.addAll(locations)'));
  assert(!kotlin.includes('sLastTimestamp'), 'deduplication is per consumer, not shared across driver/passenger tasks');
  assert.match(javaSource(), /int start = isZwangaLocationTask\(extras\)/);
  assert.match(javaSource(), /return boundedLocationExtras\(extras, data\)/);
});

test('native Java merge retains only the latest 64 samples and preserves other task identities', t => {
  if (spawnSync('javac', ['-version'], { encoding: 'utf8' }).status !== 0) {
    t.skip('JDK absent; run on Android build host'); return;
  }
  // Compile the ACTUAL patched Java helpers with a lightweight Bundle stand-in.
  // This checks algorithmic behavior, not Android Parcel/JobScheduler execution.
  const source = javaSource();
  const start = source.indexOf('  private static final int MAX_LOCATION_SAMPLES');
  const end = source.indexOf('  private JobInfo createJobInfoByAddingData', start);
  assert(start >= 0 && end > start);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-gps-unit-'));
  t.after(() => fs.rmSync(temp, { recursive: true, force: true }));
  const program = `import java.util.*;
public class LocationBatchCheck {
  private static final String EXTRAS_REQUIRED_KEY = "expo.modules.taskManager";
  static class PersistableBundle extends HashMap<String, Object> {
    void putInt(String k, int v) { put(k,v); }
    void putString(String k, String v) { put(k,v); }
    void putPersistableBundle(String k, PersistableBundle v) { put(k,v); }
    int getInt(String k, int d) { return containsKey(k) ? (Integer)get(k) : d; }
    String getString(String k, String d) { return containsKey(k) ? (String)get(k) : d; }
    PersistableBundle getPersistableBundle(String k) { return (PersistableBundle)get(k); }
  }
${source.slice(start, end)}
  static PersistableBundle sample(int n) { PersistableBundle b = new PersistableBundle(); b.putInt("n", n); return b; }
  static void check(boolean ok) { if (!ok) throw new AssertionError(); }
  public static void main(String[] args) {
    PersistableBundle original = new PersistableBundle();
    original.putString("appId", "test-app"); original.putString("taskName", "zwanga-driver-background-location");
    check(isZwangaLocationTask(original));
    PersistableBundle current = original;
    for (int i = 0; i < 10000; i++) {
      PersistableBundle previous = current;
      int previousSize = previous.size();
      current = boundedLocationExtras(previous, Arrays.asList(sample(i)));
      int count = current.getInt("dataSize", 0);
      check(count == Math.min(i + 1, 64)); check(current.size() <= 68);
      check(current.getPersistableBundle("0").getInt("n", -1) == Math.max(0, i - 63));
      check(current.getPersistableBundle("" + (count - 1)).getInt("n", -1) == i);
      check(previous.size() == previousSize);
      check(current.getString("appId", "").equals("test-app"));
    }
    List<PersistableBundle> burst = new ArrayList<>();
    for (int i=0; i<1000; i++) burst.add(sample(i));
    current = boundedLocationExtras(current, burst);
    check(current.getInt("dataSize", 0) == 64);
    check(current.getPersistableBundle("0").getInt("n", -1) == 936);
    check(boundedLocationExtras(current, null).getInt("dataSize", 0) == 64);
    for (String name : Arrays.asList("zwanga-passenger-background-location", "zwanga-nearby-driver-location-v1")) {
      original.putString("taskName", name); check(isZwangaLocationTask(original));
    }
    original.putString("taskName", "background-notification-task"); check(!isZwangaLocationTask(original));
    original.putString("taskName", "arbitrary-task"); check(!isZwangaLocationTask(original));
  }
}`;
  const file = path.join(temp, 'LocationBatchCheck.java'); fs.writeFileSync(file, program);
  const compile = spawnSync('javac', [file], { encoding: 'utf8', timeout: 30000 });
  assert.equal(compile.status, 0, compile.stderr);
  const result = spawnSync('java', ['-cp', temp, 'LocationBatchCheck'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
});
