const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const plist = require('@expo/plist').default;
const { validateIosPrivacy, checkIosPrivacy } = require('../scripts/validate-ios-privacy.cjs');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const speechKey = 'NSSpeechRecognitionUsageDescription';

function expoConfig() {
  // Never load .env, local credentials or network services in configuration tests.
  const context = {
    module: { exports: {} }, process: { env: {}, cwd: () => root },
    require: name => {
      if (name === 'dotenv') return { config() {} };
      if (name === 'fs') return { existsSync: () => false };
      if (name === 'path') return path;
      if (name === './scripts/validate-api-config.cjs') return require('../scripts/validate-api-config.cjs');
      throw new Error(`Unexpected config dependency: ${name}`);
    },
  };
  vm.runInNewContext(read('app.config.js'), context, { filename: 'app.config.js' });
  return context.module.exports.expo;
}

test('native and Expo speech purpose strings agree and describe the existing guidance, not invented voice commands', () => {
  const source = read('ios/zwanga/Info.plist');
  const native = plist.parse(source);
  const description = expoConfig().ios.infoPlist[speechKey];
  assert.deepEqual(validateIosPrivacy(native), []);
  assert.equal(native[speechKey], description);
  assert.equal(source.split(`<key>${speechKey}</key>`).length - 1, 1);
  assert.match(description, /guidage vocal.*Zwanga.*chemin.*trajet/);
  assert.match(description, /ne transcrit pas votre voix/);
  assert.doesNotMatch(description, /\$\(|TODO|commandes vocales/);
  assert.match(read('ios/zwanga.xcodeproj/project.pbxproj'), /INFOPLIST_FILE = zwanga\/Info\.plist;/);
});

test('speech guard rejects missing, blank and non-string descriptions without logging their contents', () => {
  for (const description of [undefined, null, '', ' \n\t ', 123, false, {}, []]) {
    const errors = validateIosPrivacy({ [speechKey]: description });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /NSSpeechRecognitionUsageDescription/);
  }
  assert.equal(validateIosPrivacy(null).length, 1);
  assert.deepEqual(validateIosPrivacy({ [speechKey]: 'Explication précise du service vocal.' }), []);
});

test('iOS EAS guard inspects the native file and fails closed on missing or malformed configuration', () => {
  const messages = [];
  const options = { eas: true, env: { EAS_BUILD_PLATFORM: 'ios' },
    log: message => messages.push(message), error: message => messages.push(message) };
  assert.equal(checkIosPrivacy({ ...options, read: file => {
    assert.equal(file, path.join(root, 'ios/zwanga/Info.plist'));
    return read('ios/zwanga/Info.plist');
  } }), true);
  assert.equal(checkIosPrivacy({ ...options, read: () => plist.build({}) }), false);
  assert.equal(checkIosPrivacy({ ...options, read: () => { throw new Error('secret-value'); } }), false);
  assert.equal(checkIosPrivacy({ ...options, read: () => 'not a plist' }), false);
  assert.ok(messages.some(message => message.includes(speechKey)));
  assert.ok(messages.every(message => !message.includes('secret-value')));
});

test('Android EAS builds never read or alter iOS privacy declarations', () => {
  for (const platform of ['android', undefined]) {
    assert.equal(checkIosPrivacy({ eas: true, env: { EAS_BUILD_PLATFORM: platform },
      read: () => assert.fail('Must not read iOS files'),
      log: () => assert.fail('Must not log'), error: () => assert.fail('Must not log') }), true);
  }
});

test('privacy guard runs before archiving and is included in the iOS regression command', () => {
  const scripts = require('../package.json').scripts;
  assert.match(scripts['eas-build-post-install'], /validate-ios-privacy\.cjs --eas/);
  assert.match(scripts['check:ios-privacy'], /validate-ios-privacy\.cjs/);
  assert.match(scripts['test:ios-build'], /iosPrivacy\.test\.js/);
});
