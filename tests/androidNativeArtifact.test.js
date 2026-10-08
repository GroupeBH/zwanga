const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { validateArtifact } = require('../scripts/validate-android-native.cjs');
const { applySourceBuild, applyArtifactCheck } = require('../plugins/withPatchedReactAndroid');

function archive(entries, stored = false, aligned = false) {
  const local = [], directory = []; let offset = 0;
  for (const [filename, data] of entries) {
    const name = Buffer.from(filename), compressed = stored ? data : zlib.deflateRawSync(data);
    const padding = aligned ? Buffer.alloc((16384 - (offset + 30 + name.length) % 16384) % 16384) : Buffer.alloc(0);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(stored ? 0 : 8, 8); header.writeUInt32LE(compressed.length, 18);
    header.writeUInt32LE(data.length, 22); header.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50);
    header.writeUInt16LE(padding.length, 28);
    central.writeUInt16LE(stored ? 0 : 8, 10); central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    local.push(header, name, padding, compressed); directory.push(central, name);
    offset += header.length + name.length + padding.length + compressed.length;
  }
  const metadata = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(metadata.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, metadata, end]);
}

function validElf() {
  const elf = Buffer.alloc(120);
  elf.writeUInt32BE(0x7f454c46); elf[4] = 2; elf[5] = 1; elf.writeUInt16LE(183, 18);
  elf.writeBigUInt64LE(64n, 32); elf.writeUInt16LE(56, 54); elf.writeUInt16LE(1, 56);
  elf.writeUInt32LE(1, 64); elf.writeBigUInt64LE(120n, 96); elf.writeBigUInt64LE(120n, 104);
  elf.writeBigUInt64LE(16384n, 112);
  return elf;
}

test('checks production core libraries for each ABI, including ELF architecture, not just filenames', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-native-test-'));
  const filename = path.join(directory, 'test.aab');
  t.after(() => { fs.unlinkSync(filename); fs.rmdirSync(directory); });
  const elf = validElf();
  const entries = ['libc++_shared.so', 'libreactnative.so', 'libhermes.so'].map(name => [`base/lib/arm64-v8a/${name}`, elf]);
  fs.writeFileSync(filename, archive(entries));
  assert.deepEqual(validateArtifact(filename, ['arm64-v8a']), ['arm64-v8a']);
  assert.throws(() => validateArtifact(filename, ['arm64-v8a', 'x86_64']), /x86_64/);
  fs.writeFileSync(filename, archive(entries.slice(1)));
  assert.throws(() => validateArtifact(filename, ['arm64-v8a']), /libc\+\+_shared/);
  elf.writeUInt16LE(62, 18); fs.writeFileSync(filename, archive(entries));
  assert.throws(() => validateArtifact(filename, ['arm64-v8a']), /ELF incompatible/);
  fs.writeFileSync(filename, Buffer.from('broken'));
  assert.throws(() => validateArtifact(filename, ['arm64-v8a']), /ZIP/);
});

test('validates every third-party ELF, duplicate entries and stored APK zip alignment', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zwanga-native-test-'));
  const filename = path.join(directory, 'test.apk');
  t.after(() => { fs.unlinkSync(filename); fs.rmdirSync(directory); });
  const elf = validElf();
  const core = ['libc++_shared.so', 'libreactnative.so', 'libhermes.so'].map(name => [`lib/arm64-v8a/${name}`, elf]);
  fs.writeFileSync(filename, archive(core, true, true));
  assert.deepEqual(validateArtifact(filename, ['arm64-v8a']), ['arm64-v8a']);
  fs.writeFileSync(filename, archive(core, true));
  assert.throws(() => validateArtifact(filename, ['arm64-v8a']), /alignement ZIP/);
  const invalid = validElf(); invalid.writeBigUInt64LE(4096n, 112);
  fs.writeFileSync(filename, archive([...core, ['lib/arm64-v8a/libvendor.so', invalid]]));
  assert.throws(() => validateArtifact(filename, ['arm64-v8a']), /libvendor.*16 Ko/);
  fs.writeFileSync(filename, archive([...core, core[0]]));
  assert.throws(() => validateArtifact(filename, ['arm64-v8a']), /dupliqu/);
});

test('ELF validation rejects truncated and inconsistent segments, and accepts 64 KB alignment', () => {
  const { validateElf } = require('../scripts/elf-validation.cjs');
  const elf = validElf();
  assert.throws(() => validateElf(elf.subarray(0, 110), 'arm64-v8a'), /segments ELF invalide/);
  elf.writeBigUInt64LE(1000n, 96);
  assert.throws(() => validateElf(elf, 'arm64-v8a'), /tronqu/);
  const aligned = validElf(); aligned.writeBigUInt64LE(65536n, 112);
  assert.doesNotThrow(() => validateElf(aligned, 'arm64-v8a'));
  aligned.writeBigUInt64LE(1n, 80);
  assert.throws(() => validateElf(aligned, 'arm64-v8a'), /align/);
});

test('native source substitution and release artifact checks survive prebuild without duplication', () => {
  const settings = fs.readFileSync('android/settings.gradle', 'utf8');
  const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
  assert.equal(applySourceBuild(settings), settings);
  assert.equal(applyArtifactCheck(gradle), gradle);
  const generated = applySourceBuild('include ":app"\n');
  assert.equal(applySourceBuild(generated), generated);
  assert.match(generated, /react-android.*packages:react-native:ReactAndroid/);
  assert.match(generated, /hermes-android.*hermes-engine/);
  assert.match(generated, /if \(sourceRequested \|\| releaseRequested\)/);
  assert.match(generated, /name\.contains\('release'\)/);
  assert.match(generated, /ZWANGA_DRAWING_ORDER_GUARD/);
  const release = applyArtifactCheck('apply plugin: "com.android.application"\n');
  assert.equal(applyArtifactCheck(release), release);
  assert.match(release, /bundleRelease/); assert.match(release, /assembleRelease/);
  assert.match(release, /validate-android-native\.cjs/);
});
