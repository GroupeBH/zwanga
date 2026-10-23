/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const { sourceFiles, sourceDirectory, outputDirectory, registration } = require('../plugins/withDriverAlertSources');
const { applyBridgeSettings } = require('../plugins/withIosBridgeSettings');
const normalize = text => text.replace(/\r\n/g, '\n');

function checkNativeSources(root = path.resolve(__dirname, '..')) {
  const errors = [];
  const read = file => fs.existsSync(path.join(root, file)) ? normalize(fs.readFileSync(path.join(root, file), 'utf8')) : null;
  for (const name of sourceFiles) {
    const canonical = read(`${sourceDirectory}/${name}`);
    if (!canonical) errors.push(`Missing canonical native source: ${name}`);
    if (fs.existsSync(path.join(root, 'android')) && canonical !== read(`android/${outputDirectory}/${name}`)) {
      errors.push(`Android native source drift: ${name}. Update native/android/notifications and its generated mirror together.`);
    }
  }
  if (fs.existsSync(path.join(root, 'android'))) {
    const main = read('android/app/src/main/java/com/zwanga/MainApplication.kt');
    if (!main || main.split(registration).length !== 2) errors.push('Android DriverAlertPackage registration missing or duplicated.');
  }
  const podfile = read('ios/Podfile');
  if (podfile !== null) {
    try { if (applyBridgeSettings(podfile) !== podfile) errors.push('iOS bridge settings differ from the prebuild plugin.'); }
    catch (error) { errors.push(error.message); }
  }
  return errors;
}
if (require.main === module) {
  const errors = checkNativeSources();
  if (errors.length) { errors.forEach(error => console.error(`[native-sources] ${error}`)); process.exitCode = 1; }
  else console.log('[native-sources] Native sources and prebuild policies agree; no native compilation performed.');
}
module.exports = { checkNativeSources };
