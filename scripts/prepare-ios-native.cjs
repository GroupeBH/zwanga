/* global __dirname */
const path = require('node:path');
const { spawnSync } = require('node:child_process');

/** CocoaPods, not a hand-edited lock, must resolve native dependencies on macOS. */
function prepareIosNative(run = spawnSync, platform = process.platform) {
  if (platform !== 'darwin') {
    console.error('[ios-native] Exécutez npm run prepare:ios-native sur macOS avec Xcode et CocoaPods. Aucun fichier natif modifié.');
    return 1;
  }
  const root = path.resolve(__dirname, '..');
  const steps = [
    [process.execPath, ['scripts/validate-ios-toolchain.cjs'], root],
    [process.execPath, ['scripts/check-native-sources.cjs'], root],
    ['pod', ['install'], path.join(root, 'ios')],
    [process.execPath, ['scripts/validate-ios-crashlytics.cjs'], root],
  ];
  for (const [command, args, cwd] of steps) {
    const result = run(command, args, { cwd, stdio: 'inherit', timeout: 20 * 60_000, shell: false });
    if (result.error || result.signal || result.status !== 0) return 1;
  }
  console.log('[ios-native] Pods installés et contrôlés. Archive release et essais sur appareils encore nécessaires.');
  return 0;
}
if (require.main === module) process.exitCode = prepareIosNative();
module.exports = { prepareIosNative };
