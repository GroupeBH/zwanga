const test = require('node:test');
const assert = require('node:assert/strict');
const { prepareIosNative } = require('../scripts/prepare-ios-native.cjs');
test('unsupported hosts cannot synthesize a lock or run CocoaPods', () => {
  assert.equal(prepareIosNative(() => { throw Error('must not run'); }, 'win32'), 1);
});
test('macOS resolves pods before validating installed dependencies, without deployment', () => {
  const calls = [];
  assert.equal(prepareIosNative((command, args, options) => { calls.push({ command, args, options }); return { status: 0 }; }, 'darwin'), 0);
  assert.match(calls[0].args[0], /validate-ios-toolchain/);
  assert.match(calls[1].args[0], /check-native-sources/);
  assert.equal(calls[2].command, 'pod'); assert.deepEqual(calls[2].args, ['install']);
  assert.match(calls[3].args[0], /validate-ios-crashlytics/);
  assert.ok(calls.every(call => call.options.shell === false));
});
test('a failed install stops the sequence and cannot report readiness', () => {
  let calls = 0;
  assert.equal(prepareIosNative(() => ({ status: ++calls === 3 ? 1 : 0 }), 'darwin'), 1);
  assert.equal(calls, 3);
});

test('source drift stops before CocoaPods, so a mismatched native policy cannot be labelled ready', () => {
  let calls = 0;
  assert.equal(prepareIosNative(() => ({ status: ++calls === 2 ? 1 : 0 }), 'darwin'), 1);
  assert.equal(calls, 2);
});
