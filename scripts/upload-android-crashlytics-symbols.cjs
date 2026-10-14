/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function shouldUpload(env) {
  return env.EAS_BUILD_PLATFORM === 'android' && env.EAS_BUILD_PROFILE === 'production';
}
function main() {
  if (process.argv.includes('--eas') && !shouldUpload(process.env)) return;
  const root = path.resolve(__dirname, '..', 'android');
  const libs = path.join(root, 'app/build/intermediates/merged_native_libs/release/mergeReleaseNativeLibs/out/lib');
  if (!fs.existsSync(libs)) throw new Error('Release native libraries missing. Build Android release before uploading symbols.');
  const result = spawnSync(process.platform === 'win32' ? 'gradlew.bat' : './gradlew',
    [':app:uploadCrashlyticsSymbolFileRelease', '--no-daemon'],
    { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Crashlytics native symbol upload failed. Check the EAS success-hook logs.');
}
module.exports = { shouldUpload };
if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
