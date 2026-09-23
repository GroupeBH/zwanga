const fs = require('node:fs');
const path = require('node:path');
const { openArchive } = require('./android-archive.cjs');
const MACHINES = { 'armeabi-v7a': [1, 40], 'arm64-v8a': [2, 183], x86: [1, 3], x86_64: [2, 62] };
const CORE = ['libc++_shared.so', 'libreactnative.so', 'libhermes.so'];

function validateArtifact(filename, requiredAbis = Object.keys(MACHINES)) {
  const archive = openArchive(filename);
  try {
    const prefix = filename.endsWith('.aab') ? 'base/lib/' : 'lib/';
    const errors = [];
    for (const abi of requiredAbis) {
      if (!MACHINES[abi]) throw new Error(`Architecture inconnue : ${abi}`);
      for (const library of CORE) {
        const found = archive.entries.filter(entry => entry.name === `${prefix}${abi}/${library}`);
        if (found.length !== 1 || found[0].size < 20) { errors.push(`${abi}/${library} absent, vide ou dupliqué`); continue; }
        if (library !== 'libc++_shared.so') continue;
        const elf = archive.content(found[0]);
        const [bits, machine] = MACHINES[abi];
        if (elf.length < 20 || elf.readUInt32BE(0) !== 0x7f454c46 || elf[4] !== bits || elf[5] !== 1 || elf.readUInt16LE(18) !== machine) {
          errors.push(`${abi}/${library} : format ELF incompatible`);
        }
      }
    }
    if (errors.length) throw new Error(`Paquet Android natif invalide :\n${errors.join('\n')}`);
    return requiredAbis;
  } finally { archive.close(); }
}

function findArtifacts(root) {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const filename = path.join(root, entry.name);
    return entry.isDirectory() ? findArtifacts(filename) : /\.(aab|apk)$/.test(entry.name) ? [filename] : [];
  });
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.includes('--eas') && (process.env.EAS_BUILD_PLATFORM !== 'android' || process.env.EAS_BUILD_PROFILE !== 'production')) process.exit(0);
    const auto = args.includes('--eas') || args.includes('--auto');
    const files = auto ? findArtifacts('android/app/build/outputs').filter(filename => /[\\/]release[\\/]/i.test(filename)) : args.filter(arg => !arg.startsWith('--abis='));
    if (!files.length) throw new Error('Indiquez un AAB/APK de production à contrôler. Aucun artefact release trouvé.');
    const abiOption = args.find(arg => arg.startsWith('--abis='));
    const abis = abiOption ? abiOption.slice(7).split(',') : Object.keys(MACHINES);
    for (const filename of files) console.log(`[android-native] ${path.basename(filename)} : ${validateArtifact(filename, abis).join(', ')} OK`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validateArtifact };
