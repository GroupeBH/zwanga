/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

const speechKey = 'NSSpeechRecognitionUsageDescription';
const appPlist = path.join(__dirname, '../ios/zwanga/Info.plist');

function validateIosPrivacy(infoPlist) {
  const description = infoPlist?.[speechKey];
  return typeof description === 'string' && description.trim()
    ? []
    : [`${speechKey} manque ou est vide dans le Info.plist iOS. Ajouter une explication de l'usage vocal avant de reconstruire.`];
}

function checkIosPrivacy({
  eas = false, env = process.env, read = file => fs.readFileSync(file, 'utf8'),
  log = console.log, error = console.error,
} = {}) {
  if (eas && env.EAS_BUILD_PLATFORM !== 'ios') return true;
  let infoPlist;
  try {
    infoPlist = require('@expo/plist').default.parse(read(appPlist));
  } catch {
    error('[ios-privacy] Info.plist iOS absent ou invalide : vérification des déclarations impossible.');
    return false;
  }
  const errors = validateIosPrivacy(infoPlist);
  errors.forEach(message => error(`[ios-privacy] ${message}`));
  if (errors.length) return false;
  log(`[ios-privacy] ${speechKey} présente. L'archive finale reste à valider auprès d'Apple.`);
  return true;
}

module.exports = { validateIosPrivacy, checkIosPrivacy };
if (require.main === module && !checkIosPrivacy({ eas: process.argv.includes('--eas') })) {
  process.exitCode = 1;
}
