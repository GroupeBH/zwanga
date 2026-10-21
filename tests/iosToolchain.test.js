const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { IOS_BUILD_IMAGE, resolveIosImage, validateBuildImages, validateToolchainVersions,
  checkNativeToolchain, runCheck } = require('../scripts/validate-ios-toolchain.cjs');
const config = () => ({ build: { dev: { ios: { image: IOS_BUILD_IMAGE, simulator: true } },
  'dev-device': { extends: 'dev', ios: { simulator: false } }, production: { ios: { image: IOS_BUILD_IMAGE } } } });

test('all real EAS profiles pin iOS to the SDK 54 Xcode 26 image, including inherited device builds', () => {
  const actual = require('../eas.json');
  assert.deepEqual(validateBuildImages(actual), []);
  for (const name of ['dev', 'dev-device', 'production']) assert.equal(resolveIosImage(actual.build, name), IOS_BUILD_IMAGE);
  assert.equal(actual.build.production.android.image, 'ubuntu-24.04-jdk-17-ndk-r27b');
  assert.equal(actual.build.dev.android.image, 'latest', 'Android policy is not changed by the iOS guard');
  assert.equal(actual.build.production.autoIncrement, true);
  assert.equal(actual.cli.appVersionSource, 'remote');
});

test('image aliases, missing images and unreviewed Xcode images cannot silently change the iOS toolchain', () => {
  for (const image of ['latest', 'auto', 'sdk-54', '', undefined, null, 'macos-tahoe-26.6-xcode-27.0']) {
    const value = config(); value.build.production.ios.image = image;
    assert.ok(validateBuildImages(value).length > 0);
  }
  const override = config(); override.build['dev-device'].ios.image = 'latest';
  assert.ok(validateBuildImages(override).length > 0);
});

test('image inheritance rejects invalid profiles and cycles, even if a child declares its own image', () => {
  for (const value of [null, {}, { build: {} }, { build: [] }, { build: { bad: null } },
    { build: { bad: { extends: 'missing', ios: { image: IOS_BUILD_IMAGE } } } },
    { build: { a: { extends: 'b' }, b: { extends: 'a' } } }]) {
    assert.ok(validateBuildImages(value).length > 0);
  }
  const value = config(); value.build.extra = { extends: 'dev-device' };
  assert.deepEqual(validateBuildImages(value), []);
});

test('actual native toolchain accepts Xcode and SDK 26, independent of the device OS', () => {
  for (const version of ['26', '26.0', '26.2', '26.2.1']) {
    assert.deepEqual(validateToolchainVersions(`Xcode ${version}\r\nBuild version 17A324\r\n`, `${version}\n`), []);
  }
});

test('actual SDK 27 and Xcode 27 are rejected, as are old or unreadable tools', () => {
  for (const [xcode, sdk] of [['27.0', '27.0'], ['26.0', '27.0'], ['27.0', '26.0'], ['16.4', '18.5'],
    ['26.0', '18.5'], ['26.0', ''], ['', '26.0'], ['26.0 beta', '26.0'], ['26.0', '26.0 beta']]) {
    assert.ok(validateToolchainVersions(`Xcode ${xcode}\nBuild version mock`, sdk).length > 0);
  }
});

test('native check reads selected Xcode and device SDK with bounded shell-free commands', () => {
  const commands = [];
  assert.deepEqual(checkNativeToolchain((bin, args, options) => {
    commands.push([bin, args]);
    assert.equal(options.timeout, 15000); assert.equal(options.maxBuffer, 65536); assert.equal(options.shell, undefined);
    return { status: 0, stdout: bin === 'xcodebuild' ? 'Xcode 26.0\nBuild version 17A324' : '26.0\n' };
  }), []);
  assert.deepEqual(commands, [['xcodebuild', ['-version']], ['xcrun', ['--sdk', 'iphoneos', '--show-sdk-version']]]);
});

test('missing tools, timeouts, signals and nonzero exits never pass native validation', () => {
  for (const failure of [{ status: 1 }, { status: null, signal: 'SIGTERM' },
    { error: Object.assign(Error('private environment'), { code: 'ENOENT' }) }, { error: Error('timeout') }, { status: 0 }]) {
    for (const failedCall of [1, 2]) {
      let calls = 0;
      assert.throws(() => checkNativeToolchain(() => ++calls === failedCall ? failure : { status: 0, stdout: 'Xcode 26.0' }), /Impossible de vérifier/);
      assert.equal(calls, failedCall);
    }
  }
});

function fixture(overrides = {}) {
  const logs = [], errors = [], commands = [];
  const options = { args: [], env: {}, platform: 'darwin', readConfig: config,
    log: value => logs.push(value), error: value => errors.push(value),
    run: (command) => { commands.push(command); return { status: 0, stdout: command === 'xcodebuild' ? 'Xcode 26.0\nBuild version 17A324' : '26.0' }; }, ...overrides };
  return { logs, errors, commands, check: () => runCheck(options) };
}

test('Android EAS builds skip Xcode and configuration reads, including local builds on macOS', () => {
  for (const platform of ['darwin', 'linux', 'win32']) {
    const f = fixture({ args: ['--eas'], env: { EAS_BUILD_PLATFORM: 'android' }, platform,
      readConfig: () => { throw Error('should not read'); } });
    assert.equal(f.check(), 0); assert.deepEqual(f.commands, []); assert.deepEqual(f.errors, []);
  }
});

test('EAS iOS always checks actual native tools and cannot bypass them with config-only', () => {
  for (const args of [['--eas'], ['--eas', '--config-only']]) {
    const f = fixture({ args, env: { EAS_BUILD_PLATFORM: 'ios' } });
    assert.equal(f.check(), 0); assert.equal(f.commands.length, 2);
    const incompatible = fixture({ args, env: { EAS_BUILD_PLATFORM: 'ios' },
      run: () => ({ status: 0, stdout: 'Xcode 27.0\n27.0' }) });
    assert.equal(incompatible.check(), 1);
  }
});

test('missing EAS platform, unreadable configuration and non-Mac native runs fail explicitly', () => {
  for (const overrides of [{ args: ['--eas'] }, { readConfig: () => { throw Error('invalid JSON'); } },
    { platform: 'win32' }, { platform: 'linux', args: ['--eas'], env: { EAS_BUILD_PLATFORM: 'ios' } }]) {
    const f = fixture(overrides); assert.equal(f.check(), 1); assert.equal(f.errors.length, 1); assert.equal(f.commands.length, 0);
  }
});

test('configuration-only check is portable and explicitly does not certify native launch', () => {
  const f = fixture({ args: ['--config-only'], platform: 'win32' });
  assert.equal(f.check(), 0); assert.equal(f.commands.length, 0); assert.match(f.logs[0], /sans validation native/);
  const cli = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/validate-ios-toolchain.cjs'), '--config-only'],
    { cwd: path.parse(process.cwd()).root, encoding: 'utf8', timeout: 10000 });
  assert.equal(cli.status, 0, cli.stderr); assert.match(cli.stdout, /sans validation native/);
});

test('EAS hooks and local iOS command run the guard without replacing existing release checks', () => {
  const { scripts } = require('../package.json');
  assert.match(scripts['eas-build-pre-install'], /^node \.\/scripts\/validate-ios-toolchain\.cjs --eas &&/);
  assert.match(scripts['eas-build-pre-install'], /validate-referral-config\.js && node \.\/scripts\/validate-android-crashlytics\.js$/);
  assert.match(scripts['eas-build-post-install'], /validate-ios-toolchain\.cjs --eas && node \.\/scripts\/validate-ios-crashlytics\.cjs --eas && node \.\/scripts\/check-release\.cjs$/);
  assert.equal(scripts.ios, 'node ./scripts/validate-ios-toolchain.cjs && expo run:ios');
  assert.equal(scripts['check:ios-toolchain'], 'node ./scripts/validate-ios-toolchain.cjs --config-only');
  assert.match(fs.readFileSync('scripts/validate-ios-toolchain.cjs', 'utf8'), /node:child_process/);
});
