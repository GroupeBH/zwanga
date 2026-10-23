const fs = require('node:fs');
const path = require('node:path');

const marker = 'ZWANGA_BOUNDED_LOCATION_JOBS_V1';
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) {
    throw new Error('[location-patch] Expo source changed; review the native GPS patch before building.');
  }
  return source.replace(before, after);
}

function patchTaskManager(input) {
  if (input.includes(marker)) return input;
  let source = input.replace(/\r\n/g, '\n');
  source = replaceOnce(source, '  private JobInfo createJobInfoByAddingData(JobInfo jobInfo, List<PersistableBundle> data) {', `
  // ${marker}: only Zwanga GPS snapshots are lossy; other task payloads stay untouched.
  private static final int MAX_LOCATION_SAMPLES = 64;

  private static boolean isZwangaLocationTask(PersistableBundle extras) {
    String name = extras.getString("taskName", "");
    return name.equals("zwanga-driver-background-location")
      || name.equals("zwanga-passenger-background-location")
      || name.equals("zwanga-nearby-driver-location-v1");
  }

  private static PersistableBundle boundedLocationExtras(PersistableBundle old, List<PersistableBundle> incoming) {
    // Rebuild instead of deep-copying an arbitrarily large pending job. Keep its identity.
    PersistableBundle next = new PersistableBundle();
    next.putInt(EXTRAS_REQUIRED_KEY, 1);
    next.putString("appId", old.getString("appId", ""));
    next.putString("taskName", old.getString("taskName", ""));
    int newSize = incoming == null ? 0 : incoming.size();
    int keepNew = Math.min(newSize, MAX_LOCATION_SAMPLES);
    int oldSize = Math.max(0, old.getInt("dataSize", 0));
    int keepOld = Math.min(oldSize, MAX_LOCATION_SAMPLES - keepNew);
    int count = 0;
    for (int i = oldSize - keepOld; i < oldSize; i++) {
      PersistableBundle sample = old.getPersistableBundle(String.valueOf(i));
      if (sample != null) next.putPersistableBundle(String.valueOf(count++), sample);
    }
    for (int i = newSize - keepNew; i < newSize; i++) {
      PersistableBundle sample = incoming.get(i);
      if (sample != null) next.putPersistableBundle(String.valueOf(count++), sample);
    }
    next.putInt("dataSize", count);
    return next;
  }

  private JobInfo createJobInfoByAddingData(JobInfo jobInfo, List<PersistableBundle> data) {`);
  source = replaceOnce(source, '    PersistableBundle mergedExtras = jobInfo.getExtras();', `    PersistableBundle mergedExtras = jobInfo.getExtras();
    if (isZwangaLocationTask(mergedExtras)) {
      return createJobInfo(jobInfo.getId(), jobInfo.getService(), boundedLocationExtras(mergedExtras, data));
    }`);
  source = replaceOnce(source, '    extras.putString("taskName", task.getName());', `    extras.putString("taskName", task.getName());
    if (isZwangaLocationTask(extras)) return boundedLocationExtras(extras, data);`);
  source = replaceOnce(source, '    for (int i = 0; i < dataSize; i++) {', `    int start = isZwangaLocationTask(extras) ? Math.max(0, dataSize - MAX_LOCATION_SAMPLES) : 0;
    for (int i = start; i < dataSize; i++) {`);
  return source;
}

function patchLocationConsumer(input) {
  if (input.includes(marker)) return input;
  let source = input.replace(/\r\n/g, '\n');
  source = replaceOnce(source, '  private var mDeferredDistance = 0.0', `  // ${marker}: bounded native buffer, before Bundle allocation / JS delivery.
  private val maxDeferredSamples = 64
  private var mLastReportedTimestamp: Long = 0
  private var mDeferredDistance = 0.0`);
  source = replaceOnce(source, '      lastLocation = location\n    }\n    mDeferredLocations.addAll(locations)', `      lastLocation = location
      if (mDeferredLocations.size >= maxDeferredSamples) mDeferredLocations.removeAt(0)
      mDeferredLocations.add(location)
    }`);
  source = replaceOnce(source, '    private var sLastTimestamp: Long = 0\n', '');
  source = source.replaceAll('sLastTimestamp', 'mLastReportedTimestamp');
  source = replaceOnce(source, `    if (data.size > 0) {
      // Save last reported location, reset the distance and clear a list of locations.
      mLastReportedLocation = mDeferredLocations[mDeferredLocations.size - 1]
      mDeferredDistance = 0.0
      mDeferredLocations.clear()

      // Schedule new job.`, `    // Duplicated broadcasts must not retain an ever-growing deferred buffer.
    mLastReportedLocation = mDeferredLocations.lastOrNull() ?: mLastReportedLocation
    mDeferredDistance = 0.0
    mDeferredLocations.clear()
    if (data.size > 0) {
      // Schedule new job.`);
  return source;
}

function apply(root = process.cwd(), check = false) {
  // Validate all sources before writing any. A dependency upgrade must fail loudly.
  const patches = [
    ['expo-task-manager/android/src/main/java/expo/modules/taskManager/TaskManagerUtils.java', patchTaskManager],
    ['expo-location/android/src/main/java/expo/modules/location/taskConsumers/LocationTaskConsumer.kt', patchLocationConsumer],
    ['expo-location/android/src/main/java/expo/modules/location/records/LocationArguments.kt', patchLocationNumbers],
  ].map(([file, patch]) => {
    const target = path.join(root, 'node_modules', file);
    const before = fs.readFileSync(target, 'utf8');
    return { target, before, after: patch(before) };
  });
  for (const { target, before, after } of patches) {
    if (check && before !== after) throw new Error('[location-patch] Native GPS guards absent. Run npm install before building.');
    if (!check && before !== after) fs.writeFileSync(target, after);
  }
}
function patchLocationNumbers(input) {
  const fixed = 'timeInterval = (map["timeInterval"] as? Number)?.toLong()';
  if (input.includes(fixed)) return input;
  return replaceOnce(input, 'timeInterval = map["timeInterval"] as? Long', fixed);
}
if (require.main === module) {
  apply(process.cwd(), process.argv.includes('--check'));
  console.log('[location-patch] GPS buffers bounded to 64 samples; restored numeric interval preserved.');
}
module.exports = { marker, patchTaskManager, patchLocationConsumer, patchLocationNumbers, apply };
