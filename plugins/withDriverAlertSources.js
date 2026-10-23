const fs = require('node:fs');
const path = require('node:path');
const { withDangerousMod, withMainApplication } = require('@expo/config-plugins');

const sourceFiles = ['DriverAlertModule.java', 'DriverAlertPackage.java', 'ForegroundAlertPlayer.java', 'IncomingRideActivity.java'];
const sourceDirectory = 'native/android/notifications';
const outputDirectory = 'app/src/main/java/com/zwanga/notifications';
const registration = 'add(com.zwanga.notifications.DriverAlertPackage())';

function registerPackage(source) {
  const entries = source.split(registration).length - 1;
  if (entries === 1) return source;
  const anchor = /PackageList\(this\)\.packages\.apply\s*\{/g;
  if (entries || [...source.matchAll(anchor)].length !== 1) {
    throw new Error('Driver alerts: unsupported MainApplication; package registration must be reviewed.');
  }
  return source.replace(anchor, match => `${match}\n              ${registration}`);
}

function installSources(projectRoot, platformProjectRoot) {
  // Read all canonical sources first. Never depend on a previous android/ tree:
  // prebuild --clean deletes it. Only these owned generated files are replaced.
  const files = sourceFiles.map(name => [name, fs.readFileSync(path.join(projectRoot, sourceDirectory, name))]);
  const target = path.join(platformProjectRoot, outputDirectory);
  fs.mkdirSync(target, { recursive: true });
  for (const [name, content] of files) fs.writeFileSync(path.join(target, name), content);
}

module.exports = config => {
  config = withMainApplication(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Driver alerts require the supported Kotlin MainApplication template.');
    mod.modResults.contents = registerPackage(mod.modResults.contents);
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    installSources(mod.modRequest.projectRoot, mod.modRequest.platformProjectRoot);
    return mod;
  }]);
};
Object.assign(module.exports, { sourceFiles, sourceDirectory, outputDirectory, registration, registerPackage, installSources });
