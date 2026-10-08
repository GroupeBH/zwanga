/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const json = file => JSON.parse(read(file));

// Evaluate the real config without reading .env or exposing local credentials.
const context = { module: { exports: {} }, process: { env: {}, cwd: () => root }, require: name => {
  if (name === 'dotenv') return { config() {} };
  if (name === 'fs') return { existsSync: () => false };
  if (name === 'path') return path;
  throw new Error(`Unexpected config dependency: ${name}`);
} };
vm.runInNewContext(read('app.config.js'), context, { filename: 'app.config.js' });
const expo = context.module.exports.expo;

test('Expo, package and lockfile use the same application version', () => {
  assert.match(expo.version, /^\d+\.\d+\.\d+$/);
  assert.equal(json('package.json').version, expo.version);
  const lock = json('package-lock.json');
  assert.equal(lock.version, expo.version);
  assert.equal(lock.packages[''].version, expo.version);
});

test('both Xcode configurations match Expo and Info.plist uses those build settings', () => {
  const project = read('ios/zwanga.xcodeproj/project.pbxproj');
  const marketing = [...project.matchAll(/MARKETING_VERSION = ([^;]+);/g)].map(match => match[1]);
  const builds = [...project.matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)].map(match => match[1]);
  assert.deepEqual(marketing, [expo.version, expo.version]);
  assert.deepEqual(builds, [expo.ios.buildNumber, expo.ios.buildNumber]);
  assert.match(expo.ios.buildNumber, /^[1-9]\d*$/);
  const plist = read('ios/zwanga/Info.plist');
  assert.match(plist, /<key>CFBundleShortVersionString<\/key>\s*<string>\$\(MARKETING_VERSION\)<\/string>/);
  assert.match(plist, /<key>CFBundleVersion<\/key>\s*<string>\$\(CURRENT_PROJECT_VERSION\)<\/string>/);
});

test('Android native version stays synchronized with the shared Expo configuration', () => {
  const gradle = read('android/app/build.gradle');
  assert.equal(gradle.match(/versionName "([^"]+)"/)[1], expo.version);
  assert.equal(Number(gradle.match(/versionCode (\d+)/)[1]), expo.android.versionCode);
});

test('production keeps EAS remote build numbers and automatic increments', () => {
  const eas = json('eas.json');
  assert.equal(eas.cli.appVersionSource, 'remote');
  assert.equal(eas.build.production.autoIncrement, true);
});

test('physical-device development inherits the dev client without changing simulator or production profiles', () => {
  const { build } = json('eas.json');
  const profile = build['dev-device'];
  assert.equal(profile.extends, 'dev');
  assert.equal(build[profile.extends].developmentClient, true);
  assert.equal(build[profile.extends].distribution, 'internal');
  assert.equal(profile.android.buildType, 'apk');
  assert.equal(profile.ios.simulator, false);
  assert.equal(profile.environment, 'development');
  assert.equal(profile.env.EXPO_PUBLIC_ENV, 'development');
  assert.equal(build.dev.ios.simulator, true);
  assert.equal(build.production.distribution, 'store');
  assert.equal(build.production.android.buildType, 'app-bundle');
  assert.equal(build.production.ios.simulator, false);
});
