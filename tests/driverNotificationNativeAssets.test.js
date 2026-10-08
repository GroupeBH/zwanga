/* global __dirname */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('the original PCM ringtone lasts 29 seconds and Android contains the same bundled asset', () => {
  const wav = fs.readFileSync(path.join(root, 'assets/sounds/driver_ring.wav'));
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt16LE(20), 1, 'linear PCM');
  assert.equal(wav.readUInt32LE(40) / wav.readUInt32LE(28), 29);
  assert.deepEqual(wav, fs.readFileSync(path.join(root, 'android/app/src/main/res/raw/driver_ring.wav')));
  assert.ok(/['"]?sounds['"]?:\s*\[['"]\.\/assets\/sounds\/driver_ring.wav['"]\]/.test(read('app.config.js')));
  assert.match(read('app.config.js'), /com\.apple\.developer\.usernotifications\.time-sensitive/);
});

test('the selective iOS bridge is idempotent and fails closed if the upstream delegate changes', () => {
  const { patch, marker } = require('../scripts/patch-notifee-expo-driver-actions.cjs');
  const source = 'before\n  // handle notification outside of notifee\nafter';
  const result = patch(source);
  assert.equal(patch(result), result);
  assert.equal(result.split(marker).length, 2);
  assert.ok(result.includes('driver-offer-v2'));
  assert.ok(result.includes('new_booking') && result.includes('driver_dispatch_offer'));
  assert.ok(result.endsWith('  // handle notification outside of notifee\nafter'));
  assert.throws(() => patch('changed upstream code'), /delegate changed/);
});

test('ringtone has stronger signal without clipping and repeats throughout its 29 seconds', () => {
  const wav = fs.readFileSync(path.join(root, 'assets/sounds/driver_ring.wav'));
  const count = wav.readUInt32LE(40) / 2;
  const sampleRate = wav.readUInt32LE(24);
  const cycles = [];
  let peak = 0, squared = 0;
  for (let i = 0; i < count; i++) {
    const amplitude = Math.abs(wav.readInt16LE(44 + i * 2) / 32768);
    const cycle = Math.floor(i / sampleRate / 2.4);
    peak = Math.max(peak, amplitude);
    squared += amplitude * amplitude;
    cycles[cycle] = Math.max(cycles[cycle] ?? 0, amplitude);
  }
  assert.ok(peak > 0.85 && peak < 0.95, 'audible headroom, no PCM saturation');
  const rms = Math.sqrt(squared / count);
  assert.ok(rms > 0.29 && rms < 0.34, 'signal level includes the spaces between rings');
  assert.equal(cycles.length, 13);
  assert.ok(cycles.every(value => value > 0.85), 'not a short initial beep followed by silence');
});

test('the tracked iOS project bundles the sound and declares time-sensitive notifications', () => {
  const project = require('xcode').project(path.join(root, 'ios/zwanga.xcodeproj/project.pbxproj'));
  project.parseSync();
  const objects = project.hash.project.objects;
  const build = objects.PBXBuildFile.B2061006A19E4E8DB1640001;
  assert.equal(build.fileRef, 'B2061006A19E4E8DB1640002');
  const resource = objects.PBXFileReference[build.fileRef];
  assert.equal(resource.path.replaceAll('"', ''), '../assets/sounds/driver_ring.wav');
  assert.ok(Object.values(objects.PBXResourcesBuildPhase).some(phase =>
    phase.files?.some(file => file.value === 'B2061006A19E4E8DB1640001')));
  assert.ok(/com.apple.developer.usernotifications.time-sensitive<\/key>\s*<true\/>/.test(read('ios/zwanga/zwanga.entitlements')));
});

test('headless handlers load before the router without a mounted React screen', () => {
  assert.equal(JSON.parse(read('package.json')).main, 'index.ts');
  const entry = read('index.ts');
  for (const name of ['backgroundNotificationTask', 'notifeeBackgroundHandler', 'notifeeForegroundService']) {
    assert.ok(entry.indexOf(name) >= 0 && entry.indexOf(name) < entry.indexOf('expo-router/entry'));
  }
  assert.match(JSON.parse(read('package.json')).scripts.postinstall, /patch-notifee-expo-driver-actions.cjs/);
});
