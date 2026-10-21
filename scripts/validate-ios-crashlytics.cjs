const fs = require('node:fs');

function installedPodVersions(lock) {
  const versions = new Map();
  let inPods = false;
  for (const line of lock.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    if (!inPods) {
      if (line === 'PODS:') inPods = true;
      continue;
    }
    if (/^\S/.test(line)) break;
    // Only resolved top-level PODS entries: DEPENDENCIES also contains two-space
    // entries, but their parenthesized values may be source paths, not versions.
    const match = line.match(/^  - ([^\s(]+) \(([^)]+)\):?\s*$/);
    if (match) versions.set(match[1], match[2]);
  }
  return versions;
}

function diagnosticVersion(version) {
  // Never include arbitrary lock contents (URLs, local paths) in build logs.
  return typeof version === 'string' && /^\d[\da-zA-Z.+-]*$/.test(version)
    ? version : 'absente ou illisible';
}

// CocoaPods/autolinking owns these generated files. Run AFTER pod install, not before it.
function validateIosCrashlytics(lock, project, podsProject) {
  const errors = [];
  const versions = installedPodVersions(lock);
  if (!versions.has('RNFBCrashlytics') || !versions.has('FirebaseCrashlytics')) {
    errors.push('Pods Crashlytics absents : exécuter pod install sur macOS et conserver le lock mis à jour.');
  }
  const phases = project + '\n' + podsProject;
  if (!phases.includes('[RNFB] Crashlytics Configuration') ||
      !/(?:crashlytics\/ios_config\.sh|FirebaseCrashlytics\/run)/.test(phases)) {
    errors.push('Phase de configuration/envoi des symboles Crashlytics absente après autolinking.');
  }
  return errors;
}

function validateIosDidit(lock, sdkPackage, variant) {
  const subspec = { all: 'All', core: 'Core', autodetection: 'AutoDetection', nfc: 'NFC' }[variant];
  const versions = installedPodVersions(lock);
  if (!subspec || !sdkPackage.version || !sdkPackage.diditNativeSdkVersions?.ios ||
      versions.get('SdkReactNative') !== sdkPackage.version ||
      versions.get(`DiditSDK/${subspec}`) !== sdkPackage.diditNativeSdkVersions.ios) {
    return ['Pods Didit absents ou incompatibles avec le SDK installé : ' +
      `SdkReactNative installé=${diagnosticVersion(versions.get('SdkReactNative'))}, attendu=${diagnosticVersion(sdkPackage.version)} ; ` +
      `DiditSDK/${subspec || 'variante invalide'} installé=${diagnosticVersion(versions.get(`DiditSDK/${subspec}`))}, ` +
      `attendu=${diagnosticVersion(sdkPackage.diditNativeSdkVersions?.ios)}. ` +
      'Exécuter pod install sur macOS, puis conserver le lock généré.'];
  }
  return [];
}

if (require.main === module) {
  if (!process.argv.includes('--eas') || process.env.EAS_BUILD_PLATFORM === 'ios') {
    const read = file => fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const lock = read('ios/Podfile.lock');
    const sdkPackage = require('../node_modules/@didit-protocol/sdk-react-native/package.json');
    const properties = JSON.parse(read('ios/Podfile.properties.json') || '{}');
    const errors = [
      ...validateIosCrashlytics(lock, read('ios/zwanga.xcodeproj/project.pbxproj'), read('ios/Pods/Pods.xcodeproj/project.pbxproj')),
      ...validateIosDidit(lock, sdkPackage, properties['didit.iosVariant'] || 'autodetection'),
    ];
    if (errors.length) { errors.forEach(error => console.error(`[ios-crashlytics] ${error}`)); process.exitCode = 1; }
    else console.log('[ios-crashlytics] Pods et phase de symboles présents. La réception réelle reste à vérifier sur une archive release.');
  }
}
module.exports = { validateIosCrashlytics, validateIosDidit };
