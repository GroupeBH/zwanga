const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { marker, patchHermesBuild } = require('../scripts/patch-react-native-hermes-tarball.cjs');

const gradleSource = () => fs.readFileSync('node_modules/react-native/ReactAndroid/hermes-engine/build.gradle.kts', 'utf8');

test('Hermes source unzip flattens both facebook-hermes and meta-hermes tarball folders', () => {
  const source = gradleSource();
  assert(source.includes(marker));
  assert(source.includes('this.path.startsWith("facebook-hermes-") || this.path.startsWith("meta-hermes-")'));
  assert.equal(patchHermesBuild(source), source);
  assert.match(fs.readFileSync('package.json', 'utf8'), /patch-react-native-hermes-tarball\.cjs/);
});

test('Hermes tarball patch rejects an unknown upstream build script instead of silently skipping', () => {
  assert.throws(() => patchHermesBuild('unknown version'), /unzip code changed/);
});
