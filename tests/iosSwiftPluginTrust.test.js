const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const xcode = require('xcode');
const { configureIosSwiftPluginTrust, mergePluginTrust } = require('../scripts/configure-ios-swift-plugin-trust.cjs');
const approved = require('../config/ios-swift-plugin-trust.json');
const { configureXcode } = require('../plugins/withAwsLiveness');
const projectPath = path.join(__dirname, '../ios/zwanga.xcodeproj/project.pbxproj');
const expected = { fingerprint: approved.fingerprint, packageIdentity: 'smithy-swift', targetName: 'SmithyCodeGeneratorPlugin' };
const cloudEnv = { EAS_BUILD: 'true', EAS_BUILD_PLATFORM: 'ios', EAS_BUILD_RUNNER: 'eas-build' };

function fixture() {
  const homeDirectory = path.resolve('synthetic-eas-home');
  const canonical = path.join(homeDirectory, 'Library', 'org.swift.swiftpm', 'security');
  const legacy = path.join(homeDirectory, '.swiftpm', 'security');
  const files = new Map(), directories = new Set(), writes = [], logs = [];
  const fileSystem = {
    existsSync: file => files.has(file) || directories.has(file),
    readFileSync: file => files.get(file),
    mkdirSync: directory => directories.add(directory),
    writeFileSync: (file, data, options) => { files.set(file, data); writes.push({ file, options }); },
  };
  return { files, directories, writes, logs, canonical, legacy,
    run: (overrides = {}) => configureIosSwiftPluginTrust({ platform: 'darwin', env: cloudEnv,
      homeDirectory, fileSystem, log: value => logs.push(value), ...overrides }) };
}

test('EAS iOS trusts exactly the approved Smithy plugin revision, once', () => {
  const app = fixture();
  assert.equal(app.run(), true);
  const file = path.join(app.canonical, 'plugins.json');
  assert.deepEqual(JSON.parse(app.files.get(file)), [expected]);
  assert.deepEqual(app.writes, [{ file, options: { encoding: 'utf8', mode: 0o600 } }]);
  assert.equal(app.run(), true); assert.equal(app.writes.length, 1);
  assert.equal(app.directories.has(app.legacy), false, 'no replacement of SwiftPM symlinks');
  assert.match(app.logs[0], /SmithyCodeGeneratorPlugin.*0\.238\.0/);
});

test('Android, Windows, ordinary npm scripts and local EAS builds never alter a trust store', () => {
  const cases = [
    { env: {} }, { env: { ...cloudEnv, EAS_BUILD: 'false' } },
    { env: { ...cloudEnv, EAS_BUILD_PLATFORM: 'android' } },
    { env: { ...cloudEnv, EAS_BUILD_RUNNER: 'local-build-plugin' } },
    { env: { ...cloudEnv, EAS_BUILD_RUNNER: undefined } },
    { platform: 'win32' }, { platform: 'linux' },
  ];
  for (const patch of cases) {
    const app = fixture();
    assert.equal(app.run(patch), false); assert.equal(app.writes.length, 0);
    assert.equal(app.directories.size, 0);
  }
});

test('existing approvals are preserved without granting trust to other targets or revisions', () => {
  const other = { packageIdentity: 'other-package', targetName: 'OtherPlugin', fingerprint: 'a'.repeat(40) };
  const input = [other]; const snapshot = JSON.stringify(input);
  assert.deepEqual(mergePluginTrust(input), [other, expected]);
  assert.equal(JSON.stringify(input), snapshot);
  const otherTarget = { ...expected, targetName: 'OtherSmithyPlugin' };
  const otherRevision = { ...expected, fingerprint: 'b'.repeat(40) };
  assert.deepEqual(mergePluginTrust([otherTarget, otherRevision]), [otherTarget, otherRevision, expected]);
  const trusted = [other, expected]; assert.equal(mergePluginTrust(trusted), trusted);
});

test('a separate legacy store is supported without removing its unrelated approvals', () => {
  const app = fixture(); app.directories.add(app.legacy);
  const legacyFile = path.join(app.legacy, 'plugins.json');
  const other = { packageIdentity: 'other', targetName: 'ExistingPlugin', fingerprint: 'a'.repeat(40) };
  app.files.set(legacyFile, JSON.stringify([other]));
  app.run();
  assert.deepEqual(JSON.parse(app.files.get(legacyFile)), [other, expected]);
  assert.deepEqual(JSON.parse(app.files.get(path.join(app.canonical, 'plugins.json'))), [expected]);
  app.run(); assert.equal(app.writes.length, 2);
});

test('malformed stores fail closed without any write or global bypass', () => {
  for (const invalid of [null, {}, [null], ['entry'], [{ packageIdentity: 'other' }]]) {
    assert.throws(() => mergePluginTrust(invalid), /Registre de confiance/);
  }
  for (const invalid of ['not json', '{}', '[null]']) {
    const app = fixture(); app.directories.add(app.legacy);
    const legacyFile = path.join(app.legacy, 'plugins.json'); app.files.set(legacyFile, invalid);
    assert.throws(() => app.run()); assert.equal(app.writes.length, 0);
    assert.equal(app.files.get(legacyFile), invalid);
  }
});

test('the checked-in Xcode project pins the package already used by AWS to the approved version', () => {
  const project = xcode.project(projectPath); project.parseSync();
  const objects = project.hash.project.objects;
  const refs = Object.entries(objects.XCRemoteSwiftPackageReference).filter(([, ref]) =>
    ref?.repositoryURL === `"${approved.repositoryURL}"`);
  assert.equal(refs.length, 1);
  assert.deepEqual({ ...refs[0][1].requirement }, { kind: 'exactVersion', version: approved.version });
  assert.ok(project.getFirstProject().firstProject.packageReferences.some(ref => ref.value === refs[0][0]));
  assert.match(approved.fingerprint, /^[a-f0-9]{40}$/);
});

test('Expo regeneration restores the Smithy pin and remains idempotent without new linked products', () => {
  const project = xcode.project(projectPath); project.parseSync();
  const objects = project.hash.project.objects, root = project.getFirstProject().firstProject;
  const products = JSON.stringify(objects.XCSwiftPackageProductDependency);
  const id = Object.keys(objects.XCRemoteSwiftPackageReference).find(key =>
    objects.XCRemoteSwiftPackageReference[key]?.repositoryURL === `"${approved.repositoryURL}"`);
  delete objects.XCRemoteSwiftPackageReference[id];
  root.packageReferences = root.packageReferences.filter(ref => ref.value !== id);
  configureXcode(project, 'zwanga');
  const first = project.writeSync(); configureXcode(project, 'zwanga');
  assert.equal(project.writeSync(), first); assert.equal(JSON.stringify(objects.XCSwiftPackageProductDependency), products);
  const smithy = Object.values(objects.XCRemoteSwiftPackageReference).find(ref => ref?.repositoryURL === `"${approved.repositoryURL}"`);
  assert.deepEqual(smithy.requirement, { kind: 'exactVersion', version: approved.version });
  smithy.requirement = { kind: 'upToNextMajorVersion', minimumVersion: '0.1.0' };
  configureXcode(project, 'zwanga');
  assert.deepEqual(smithy.requirement, { kind: 'exactVersion', version: approved.version });
});

test('the EAS post-install hook preserves existing checks and avoids global validation bypasses', () => {
  const scripts = require('../package.json').scripts;
  const hook = scripts['eas-build-post-install'];
  assert.match(hook, /patch-expo-location-batches\.cjs --check && node .*validate-ios-crashlytics\.cjs --eas && node .*configure-ios-swift-plugin-trust\.cjs$/);
  const source = fs.readFileSync(path.join(__dirname, '../scripts/configure-ios-swift-plugin-trust.cjs'), 'utf8');
  const config = fs.readFileSync(path.join(__dirname, '../eas.json'), 'utf8');
  assert.doesNotMatch(source + config, /skipPackagePluginValidation|skipMacroValidation|IDESkip|GYM_SKIP_CODESIGNING/);
  assert.equal(require('../eas.json').build.production.autoIncrement, true);
  assert.equal(require('../eas.json').build.production.distribution, 'store');
});
