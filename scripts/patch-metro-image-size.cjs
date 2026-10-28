/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');

// Metro 0.83 supports image-size 1's synchronous path API. The security-fixed
// image-size 2 uses a separate async file API, with bounded header reads.
const before = 'const dimensions = isImage ? (0, _imageSize.default)(isImageInput) : null;';
const after = `const dimensions = isImage
    ? typeof isImageInput === "string"
      ? await require("image-size/fromFile").imageSizeFromFile(isImageInput)
      : (0, _imageSize.default)(isImageInput)
    : null;`;

function patchAssets(source) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error('Metro image-size integration changed; review the security compatibility patch.');
  return source.replace(before, after);
}

function applyPatch(root = path.resolve(__dirname, '..'), check = false) {
  const metro = path.dirname(require.resolve('metro/package.json', { paths: [root] }));
  const file = path.join(metro, 'src/Assets.js');
  const source = fs.readFileSync(file, 'utf8');
  const patched = patchAssets(source);
  if (check && patched !== source) throw new Error('Metro image-size patch is missing; run npm run postinstall.');
  if (!check && patched !== source) fs.writeFileSync(file, patched);
}

if (require.main === module) {
  applyPatch(undefined, process.argv.includes('--check'));
  console.log('[metro-image-patch] Asset paths use the security-fixed image-size file API.');
}
module.exports = { applyPatch, patchAssets };
