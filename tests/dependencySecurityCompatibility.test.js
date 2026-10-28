/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');

test('patched URI decoder preserves route parameters and handles malformed input without hanging', () => {
  const result = spawnSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const query = require('query-string');
    const input = { destination: 'Gare Centrale · Gombe', requestId: 'request-test', literal: 'a+b & c' };
    assert.deepEqual({ ...query.parse(query.stringify(input)) }, input);
    assert.deepEqual(query.parse('seat=1&seat=2').seat, ['1', '2']);
    const value = '%C1'.repeat(50000);
    assert.equal(typeof query.parse('destination=' + value).destination, 'string');
    console.log('route decoding passed');
  `], { cwd: root, encoding: 'utf8', timeout: 10_000 });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /route decoding passed/);
});

test('Metro reads real image assets with the patched image-size dependency', () => {
  const metroRoot = path.dirname(require.resolve('metro/package.json'));
  const { getAssetSize } = require(path.join(metroRoot, 'src/Assets.js'));
  const file = path.join(root, 'assets/images/zwanga.png');
  const size = getAssetSize('png', fs.readFileSync(file), file);
  assert.ok(size.width > 0 && size.height > 0);
  assert.throws(() => getAssetSize('png', Buffer.alloc(0), 'empty.png'), /empty/);
});

test('Metro exports file-based assets with the patched image-size file API', async () => {
  const metroRoot = path.dirname(require.resolve('metro/package.json'));
  const { getAssetData, getAssetSize } = require(path.join(metroRoot, 'src/Assets.js'));
  for (const relative of ['assets/images/zwanga.png', 'node_modules/expo-router/assets/file.png']) {
    const file = path.join(root, relative);
    const expected = getAssetSize('png', fs.readFileSync(file), file);
    const data = await getAssetData(file, relative, [], 'ios', '/assets');
    assert.equal(data.width, expected.width);
    assert.equal(data.height, expected.height);
    assert.ok(data.hash && data.files.includes(file));
  }
});

test('updated Xcode parser can round-trip the existing project in memory', () => {
  const xcode = require('xcode');
  const project = xcode.project(path.join(root, 'ios/zwanga.xcodeproj/project.pbxproj'));
  project.parseSync();
  const output = project.writeSync();
  assert.ok(output.includes(`MARKETING_VERSION = ${require('../package.json').version}`));
  assert.match(output, /RNFBCrashlytics|Crashlytics/);
  assert.match(output, /driver_ring.wav/);
});

test('patched PostCSS still transforms styles and generates source maps', async () => {
  const postcss = require('postcss');
  const result = await postcss([{
    postcssPlugin: 'zwanga-security-compatibility-test',
    Declaration(declaration) { if (declaration.prop === 'color') declaration.value = 'green'; },
  }]).process('.notice { color: red; }', {
    from: 'notice.css', to: 'output.css', map: { inline: false },
  });
  assert.match(result.css, /color: green/);
  assert.ok(result.map.toJSON().sources.includes('notice.css'));
});

test('Node version is aligned across local configuration, engine constraints and EAS profiles', () => {
  const version = fs.readFileSync(path.join(root, '.nvmrc'), 'utf8').trim();
  const pkg = require('../package.json');
  const eas = require('../eas.json');
  const semver = require('semver');
  assert.ok(semver.satisfies(version, pkg.engines.node));
  assert.equal(eas.build.dev.node, version);
  assert.equal(eas.build.production.node, version);
  assert.equal(eas.build['dev-device'].extends, 'dev');
  assert.equal(eas.build['ride-alerts-test'].extends, 'production');
});
