// Freeze pre-refactor definitions once; tests never need Git or a working-tree baseline.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { properties, stylesHash, endpointHashes } = require('../../tests/helpers/extractionSnapshot.cjs');
const target = 'tests/fixtures/sourceExtractions.json';
if (fs.existsSync(target)) throw new Error('Snapshot already exists; do not silently reset the baseline');
const baseline = { styles: {}, endpoints: {} };
const before = file => execFileSync('git', ['show', `HEAD:${file}`], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) visit(file);
    else if (entry.name === 'index.ts') {
      const relative = directory.replaceAll('\\', '/').replace('features/screen-styles/', '')
        .replaceAll('/detail', '/[id]').replace('app/tabs/', 'app/(tabs)/');
      const original = [`${relative}.tsx`, `${relative}.ts`].find(value => fs.existsSync(value));
      if (!original) throw new Error(`Original style module not found: ${directory}`);
      baseline.styles[file] = stylesHash(properties(original, before(original), 'styles'));
    }
  }
}
visit('features/screen-styles');
for (const name of ['trip', 'booking', 'tripRequest', 'safety', 'user']) {
  const file = `store/api/${name}Api.ts`;
  baseline.endpoints[file] = endpointHashes(properties(file, before(file), 'endpoints'));
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify(baseline, null, 2) + '\n');
console.log(`Snapshot: ${Object.keys(baseline.styles).length} style modules and ${Object.keys(baseline.endpoints).length} APIs.`);
