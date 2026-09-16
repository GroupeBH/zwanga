/* global __dirname */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateCrashlyticsGradle } = require('../scripts/validate-android-crashlytics');

const project = "buildscript { dependencies { classpath 'com.google.firebase:firebase-crashlytics-gradle:3.0.6' } }";
const google = "apply plugin: 'com.google.gms.google-services'";
const crashlytics = "apply plugin: 'com.google.firebase.crashlytics'";
const app = `${google}\n${crashlytics}`;

test('Crashlytics requires both its buildscript dependency and app plugin', () => {
  assert.deepEqual(validateCrashlyticsGradle(project, app), []);
  assert.equal(validateCrashlyticsGradle('', app).length, 1);
  assert.equal(validateCrashlyticsGradle(project, google).length, 1);
  assert.equal(validateCrashlyticsGradle('', google).length, 2);
});

test('commented-out configuration does not pass the build guard', () => {
  assert.equal(validateCrashlyticsGradle(`/* ${project} */`, `${google}\n// ${crashlytics}`).length, 2);
  assert.equal(validateCrashlyticsGradle(`// ${project}`, `${google}\n/* ${crashlytics} */`).length, 2);
});

test('the Google Services plugin must be applied before Crashlytics', () => {
  assert.equal(validateCrashlyticsGradle(project, crashlytics).length, 1);
  assert.equal(validateCrashlyticsGradle(project, `${crashlytics}\n${google}`).length, 1);
});

test('Groovy parentheses and double quotes are accepted', () => {
  const dependency = 'classpath("com.google.firebase:firebase-crashlytics-gradle:3.0.6")';
  assert.deepEqual(validateCrashlyticsGradle(dependency, app.replaceAll("'", '"')), []);
});

test('the committed native Android project has the required Crashlytics tooling', () => {
  const root = path.resolve(__dirname, '..');
  assert.deepEqual(validateCrashlyticsGradle(
    fs.readFileSync(path.join(root, 'android/build.gradle'), 'utf8'),
    fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8'),
  ), []);
});

test('EAS checks native Crashlytics configuration before building', () => {
  const { scripts } = require('../package.json');
  assert.match(scripts['eas-build-pre-install'], /node \.\/scripts\/validate-android-crashlytics\.js/);
});
