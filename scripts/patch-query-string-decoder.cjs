/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

// Expo Router 6 uses query-string 7 (CommonJS). The fixed URI decoder is ESM;
// keep the public query-string API while loading its default export explicitly.
// This avoids retaining the exponential malformed-percent decoder (GHSA-vcc3-ghjq-m6fr).
const before = "const decodeComponent = require('decode-uri-component');";
const after = "const decodeComponent = require('decode-uri-component').default;";

function patchDecoder(source) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error('query-string decoder import changed; review the security compatibility patch.');
  return source.replace(before, after);
}

function applyPatch(root = path.resolve(__dirname, '..'), check = false) {
  const file = require.resolve('query-string', { paths: [root] });
  const source = fs.readFileSync(file, 'utf8');
  const patched = patchDecoder(source);
  if (check && patched !== source) throw new Error('query-string security compatibility patch is missing; run npm run postinstall.');
  if (!check && patched !== source) fs.writeFileSync(file, patched);
}

if (require.main === module) {
  applyPatch(undefined, process.argv.includes('--check'));
  console.log('[query-string-patch] Fixed ESM decoder is compatible with Expo Router 6.');
}
module.exports = { applyPatch, patchDecoder };
