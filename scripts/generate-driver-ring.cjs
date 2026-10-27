/* global __dirname, Buffer */
// Original, deterministic light marimba motif. No downloaded/licensed audio.
const fs = require('node:fs');
const path = require('node:path');
const sampleRate = 22050;
function generateDriverRing(seconds) {
// A wooden-bar timbre: warm notes overlap with natural decay, without gaps
// between motifs. Preserve soft attacks and headroom instead of compression.
// System volume, silent mode and DND stay untouched.
const notes = [523.25, 659.25, 783.99, 659.25];
const noteStep = 0.36, noteLength = 1.6;
const count = sampleRate * seconds;
const wav = Buffer.alloc(44 + count * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
const samples = new Float64Array(count);
let peak = 0;
for (let i = 0; i < count; i++) {
  const t = i / sampleRate, lastNote = Math.floor(t / noteStep);
  let tone = 0;
  for (let note = Math.max(0, lastNote - 4); note <= lastNote; note++) {
    const age = t - note * noteStep, frequency = notes[note % notes.length];
    if (age < 0 || age > noteLength) continue;
    const attack = Math.min(1, age / 0.02);
    const release = Math.min(1, (noteLength - age) / 0.12);
    const angle = 2 * Math.PI * frequency * age;
    tone += attack * release * (Math.sin(angle) * Math.exp(-age / 0.45)
      + 0.14 * Math.sin(angle * 4) * Math.exp(-age / 0.10)
      + 0.035 * Math.sin(angle * 10) * Math.exp(-age / 0.025));
  }
  samples[i] = tone * Math.min(1, (seconds - t) / 0.1);
  peak = Math.max(peak, Math.abs(samples[i]));
}
// Normalize the overlapping notes as a whole; no clipping or flat-topped limiter.
for (let i = 0; i < count; i++) {
  wav.writeInt16LE(Math.round(samples[i] * 0.74 / peak * 32767), 44 + i * 2);
}
return wav;
}
// Apple requires a custom notification sound strictly under 30 seconds.
const wav = generateDriverRing(29), androidWav = generateDriverRing(60);
const target = path.resolve(__dirname, '../assets/sounds/driver_ring.wav');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, wav);
const androidSource = path.resolve(__dirname, '../assets/sounds/android/driver_ring.wav');
fs.mkdirSync(path.dirname(androidSource), { recursive: true });
fs.writeFileSync(androidSource, androidWav);
// This repository also ships its Android native project (EAS does not prebuild it).
const androidProject = path.resolve(__dirname, '../android/app/src/main');
if (fs.existsSync(androidProject)) {
  const raw = path.join(androidProject, 'res/raw');
  fs.mkdirSync(raw, { recursive: true });
  fs.writeFileSync(path.join(raw, 'driver_ring.wav'), androidWav);
}
console.log('Continuous light marimba: PCM mono, 22050 Hz; iOS 29 seconds, Android 60 seconds.');
