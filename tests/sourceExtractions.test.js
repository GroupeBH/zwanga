/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { properties, stylesHash, endpointHashes } = require('./helpers/extractionSnapshot.cjs');
const { loader } = require('./helpers/loadTypeScript.cjs');
const baseline = require('./fixtures/sourceExtractions.json');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('style extraction preserves every key and value, including platform-specific layout', () => {
  for (const [file, expected] of Object.entries(baseline.styles)) {
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    const combined = {};
    for (const declaration of source.statements.filter(ts.isImportDeclaration)) {
      const imported = path.join(path.dirname(file), `${declaration.moduleSpecifier.text}.ts`);
      Object.assign(combined, properties(imported, read(imported), 'styles'));
    }
    assert.deepEqual(stylesHash(combined), expected, file);
  }
});

for (const [file, expected] of Object.entries(baseline.endpoints)) {
  test(`${file}: request payloads, transforms, cache invalidation and lifecycle callbacks are unchanged`, () => {
    const all = properties(file, read(file), 'endpoints');
    const source = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    for (const declaration of source.statements.filter(ts.isImportDeclaration)) {
      const module = declaration.moduleSpecifier.text;
      if (!module.endsWith('.endpoints')) continue;
      const imported = path.join(path.dirname(file), `${module}.ts`);
      for (const [key, value] of Object.entries(properties(imported, read(imported), 'endpoints'))) {
        assert.equal(Object.hasOwn(all, key), false, `Duplicated endpoint ${key}`);
        all[key] = value;
      }
    }
    assert.deepEqual(endpointHashes(all), expected);
  });
}

test('public type barrel still exports the notification status runtime enum', () => {
  assert.deepEqual(loader()('types/index.ts').NotificationStatus, { SENT: 'sent', FAILED: 'failed', PENDING: 'pending' });
});
