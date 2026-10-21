/* global __dirname */
// Temporary SDK 54 policy: do not compile the legacy AppDelegate with the iOS 27 SDK.
// Revisit together with a tested UIScene migration, not with an Info.plist-only change.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const IOS_BUILD_IMAGE = 'macos-sequoia-15.6-xcode-26.0';

function resolveIosImage(build, name, seen = new Set()) {
  if (seen.has(name)) throw new Error('Héritage circulaire dans les profils EAS.');
  const profile = Object.hasOwn(build, name) && build[name];
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) {
    throw new Error('Profil EAS absent ou invalide.');
  }
  seen.add(name);
  const inherited = profile.extends === undefined ? undefined : resolveIosImage(build, profile.extends, seen);
  return profile.ios?.image === undefined ? inherited : profile.ios.image;
}

function validateBuildImages(config) {
  const build = config?.build;
  if (!build || typeof build !== 'object' || Array.isArray(build) || !Object.keys(build).length) {
    return ['Aucun profil de build EAS à vérifier.'];
  }
  const errors = [];
  for (const name of Object.keys(build)) {
    try {
      if (resolveIosImage(build, name) !== IOS_BUILD_IMAGE) {
        errors.push(`Image iOS non figée : utiliser ${IOS_BUILD_IMAGE} dans chaque profil ou son parent.`);
      }
    } catch (error) { errors.push(error.message); }
  }
  return [...new Set(errors)];
}

function validateToolchainVersions(xcodeOutput, sdkOutput) {
  const xcode = /^Xcode (\d+)(?:\.\d+)*\s*$/m.exec(xcodeOutput);
  const sdk = /^(\d+)(?:\.\d+)*$/.exec(sdkOutput.trim());
  if (!xcode || !sdk) return ['Version Xcode ou SDK iOS illisible : compilation bloquée.'];
  if (Number(xcode[1]) !== 26 || Number(sdk[1]) !== 26) {
    return ['Ce projet Expo SDK 54 exige Xcode 26.x avec le SDK iOS 26.x. Xcode/SDK 27 nécessitent une migration UIScene complète ; les SDK plus anciens ne satisfont pas la politique de soumission.'];
  }
  return [];
}

function checkNativeToolchain(run = spawnSync) {
  const query = (command, args) => {
    const result = run(command, args, { encoding: 'utf8', timeout: 15_000, maxBuffer: 64 * 1024 });
    if (result.error || result.signal || result.status !== 0 || typeof result.stdout !== 'string') {
      throw new Error('Impossible de vérifier Xcode/le SDK actif. Sélectionner Xcode 26 dans les outils développeur avant de compiler.');
    }
    return result.stdout;
  };
  return validateToolchainVersions(query('xcodebuild', ['-version']), query('xcrun', ['--sdk', 'iphoneos', '--show-sdk-version']));
}

function runCheck({ args = process.argv.slice(2), env = process.env, platform = process.platform,
  readConfig = () => JSON.parse(fs.readFileSync(path.join(__dirname, '../eas.json'), 'utf8')),
  run = spawnSync, log = console.log, error = console.error } = {}) {
  // Android hooks must not need Xcode, even on an Android local build hosted on macOS.
  if (args.includes('--eas') && env.EAS_BUILD_PLATFORM === 'android') return 0;
  try {
    if (args.includes('--eas') && env.EAS_BUILD_PLATFORM !== 'ios') {
      throw new Error('Plateforme EAS absente ou inconnue : contrôle iOS impossible.');
    }
    const errors = validateBuildImages(readConfig());
    if (errors.length) throw new Error(errors.join('\n'));
    if (!args.includes('--config-only') || args.includes('--eas')) {
      if (platform !== 'darwin') throw new Error('Vérification native iOS réservée à macOS. Utiliser --config-only pour contrôler uniquement eas.json.');
      const nativeErrors = checkNativeToolchain(run);
      if (nativeErrors.length) throw new Error(nativeErrors.join('\n'));
      log('[ios-toolchain] Xcode 26.x et SDK iOS 26.x vérifiés ; lancement sur appareil non testé.');
    } else {
      log('[ios-toolchain] Images EAS figées. Contrôle de configuration uniquement, sans validation native.');
    }
    return 0;
  } catch (failure) { error(`[ios-toolchain] ${failure.message}`); return 1; }
}

if (require.main === module) process.exitCode = runCheck();
module.exports = { IOS_BUILD_IMAGE, resolveIosImage, validateBuildImages, validateToolchainVersions, checkNativeToolchain, runCheck };
