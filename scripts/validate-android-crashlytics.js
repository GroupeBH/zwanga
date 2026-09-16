/* global __dirname */

const fs = require('node:fs');
const path = require('node:path');

// The Android directory is committed: EAS does not automatically run Expo
// prebuild, so an Expo config plugin alone does not configure this build.
function validateCrashlyticsGradle(projectGradle, appGradle) {
  const withoutComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const project = withoutComments(projectGradle);
  const app = withoutComments(appGradle);
  const failures = [];

  if (!/\bclasspath\s*\(?\s*['"]com\.google\.firebase:firebase-crashlytics-gradle:[^'"]+['"]/.test(project)) {
    failures.push('La dépendance Gradle Crashlytics manque dans android/build.gradle.');
  }

  const googleServices = /\bapply\s+plugin:\s*['"]com\.google\.gms\.google-services['"]/.exec(app);
  const crashlytics = /\bapply\s+plugin:\s*['"]com\.google\.firebase\.crashlytics['"]/.exec(app);
  if (!googleServices) {
    failures.push('Le plugin Google Services manque dans android/app/build.gradle.');
  }
  if (!crashlytics) {
    failures.push('Le plugin Crashlytics manque dans android/app/build.gradle : risque de fermeture au démarrage.');
  } else if (googleServices && googleServices.index > crashlytics.index) {
    failures.push('Appliquez le plugin Crashlytics après le plugin Google Services.');
  }

  return failures;
}

function main() {
  if (process.env.EAS_BUILD_PLATFORM === 'ios') {
    console.log('[android-crashlytics] Vérification Android ignorée pour le build iOS.');
    return;
  }

  const root = path.resolve(__dirname, '..');
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (!packageJson.dependencies?.['@react-native-firebase/crashlytics']) return;
  if (!fs.existsSync(path.join(root, 'android'))) {
    console.log('[android-crashlytics] Projet natif absent : la configuration sera générée par Expo prebuild.');
    return;
  }

  const failures = validateCrashlyticsGradle(
    fs.readFileSync(path.join(root, 'android', 'build.gradle'), 'utf8'),
    fs.readFileSync(path.join(root, 'android', 'app', 'build.gradle'), 'utf8'),
  );
  if (failures.length > 0) {
    console.error('[android-crashlytics] Configuration native invalide :');
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exitCode = 1;
    return;
  }
  console.log('[android-crashlytics] Configuration Gradle valide.');
}

module.exports = { validateCrashlyticsGradle };
if (require.main === module) main();
