const fs = require('node:fs');

// CocoaPods/autolinking owns these generated files. Run AFTER pod install, not before it.
function validateIosCrashlytics(lock, project, podsProject) {
  const errors = [];
  if (!/^\s+- RNFBCrashlytics \(/m.test(lock) || !/^\s+- FirebaseCrashlytics \(/m.test(lock)) {
    errors.push('Pods Crashlytics absents : exécuter pod install sur macOS et conserver le lock mis à jour.');
  }
  const phases = project + '\n' + podsProject;
  if (!phases.includes('[RNFB] Crashlytics Configuration') ||
      !/(?:crashlytics\/ios_config\.sh|FirebaseCrashlytics\/run)/.test(phases)) {
    errors.push('Phase de configuration/envoi des symboles Crashlytics absente après autolinking.');
  }
  return errors;
}

if (require.main === module) {
  if (!process.argv.includes('--eas') || process.env.EAS_BUILD_PLATFORM === 'ios') {
    const read = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const errors = validateIosCrashlytics(read('ios/Podfile.lock'),
      read('ios/zwanga.xcodeproj/project.pbxproj'), read('ios/Pods/Pods.xcodeproj/project.pbxproj'));
    if (errors.length) { errors.forEach(error => console.error(`[ios-crashlytics] ${error}`)); process.exitCode = 1; }
    else console.log('[ios-crashlytics] Pods et phase de symboles présents. La réception réelle reste à vérifier sur une archive release.');
  }
}
module.exports = { validateIosCrashlytics };
