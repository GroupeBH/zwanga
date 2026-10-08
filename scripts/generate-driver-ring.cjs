/* global __dirname, Buffer */
// Original, deterministic two-tone notification sound. No downloaded/licensed audio.
const fs = require('node:fs');
const path = require('node:path');
const sampleRate = 22050;
const seconds = 29; // Apple requires a custom notification sound strictly under 30 seconds.
const count = sampleRate * seconds;
const wav = Buffer.alloc(44 + count * 2);
wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28);
wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(count * 2, 40);
for (let i = 0; i < count; i++) {
  const t = i / sampleRate, phase = t % 2.4;
  const pulse = phase < 0.55 ? phase : phase >= 0.8 && phase < 1.35 ? phase - 0.8 : -1;
  const envelope = pulse < 0 ? 0 : Math.min(1, pulse / 0.02, (0.55 - pulse) / 0.06);
  const fade = Math.min(1, (seconds - t) / 0.1);
  const value = (Math.sin(2 * Math.PI * 660 * t) + 0.45 * Math.sin(2 * Math.PI * 880 * t)) * 0.42 * envelope * fade;
  wav.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
}
const target = path.resolve(__dirname, '../assets/sounds/driver_ring.wav');
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, wav);
// This repository also ships its Android native project (EAS does not prebuild it).
const androidProject = path.resolve(__dirname, '../android/app/src/main');
if (fs.existsSync(androidProject)) {
  const raw = path.join(androidProject, 'res/raw');
  fs.mkdirSync(raw, { recursive: true });
  fs.writeFileSync(path.join(raw, 'driver_ring.wav'), wav);
}
console.log('driver_ring.wav: PCM mono, 22050 Hz, 29 seconds, ' + wav.length + ' bytes');
