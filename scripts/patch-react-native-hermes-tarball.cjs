const fs = require('node:fs');
const path = require('node:path');

// Release builds compile Hermes from source (see android/settings.gradle). GitHub now redirects
// facebook/hermes tarballs to meta/hermes, whose top-level folder is `meta-hermes-<sha>`.
// React Native 0.81 only flattens `facebook-hermes-`, leaving sdks/hermes without CMakeLists.txt.
const marker = 'ZWANGA_HERMES_TARBALL_PREFIX';
const before = '          if (this.path.startsWith("facebook-hermes-")) {';
const after = [
  `          // ${marker}: facebook/hermes tarballs now unpack as meta-hermes-<sha>.`,
  '          if (this.path.startsWith("facebook-hermes-") || this.path.startsWith("meta-hermes-")) {',
].join('\n');

function patchHermesBuild(input) {
  if (input.includes(marker)) return input;
  const source = input.replace(/\r\n/g, '\n');
  if (source.split(before).length !== 2) {
    throw new Error('[hermes-tarball-patch] React Native Hermes unzip code changed; review this patch.');
  }
  return source.replace(before, after);
}

function run(root = process.cwd()) {
  const target = path.join(root, 'node_modules', 'react-native', 'ReactAndroid', 'hermes-engine', 'build.gradle.kts');
  if (!fs.existsSync(target)) {
    throw new Error(`[hermes-tarball-patch] React Native source not found: ${target}`);
  }
  const source = fs.readFileSync(target, 'utf8');
  if (source.includes(marker)) {
    console.log('[hermes-tarball-patch] Already applied.');
    return;
  }
  fs.writeFileSync(target, patchHermesBuild(source), 'utf8');
  console.log('[hermes-tarball-patch] Hermes source tarball accepts the meta-hermes prefix.');
}

if (require.main === module) run();

module.exports = { marker, patchHermesBuild };
