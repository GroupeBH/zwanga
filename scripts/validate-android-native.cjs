const fs = require('node:fs');
const path = require('node:path');
const { openArchive } = require('./android-archive.cjs');
const { MACHINES, validateElf } = require('./elf-validation.cjs');
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
      }
    }
    const seen = new Set();
    for (const entry of archive.entries) {
      // Include dynamic feature modules as well as base/lib in an AAB.
      const match = entry.name.match(/^(?:[^/]+\/)?lib\/([^/]+)\/([^/]+\.so)$/);
      if (!match) continue;
      try {
        if (seen.has(entry.name)) throw new Error('bibliothèque dupliquée');
        seen.add(entry.name);
        validateElf(archive.content(entry), match[1]);
        if (!filename.endsWith('.aab') && entry.method === 0 &&
            archive.dataOffset(entry) % (MACHINES[match[1]][0] === 2 ? 16384 : 4096) !== 0) {
          throw new Error('alignement ZIP de la bibliothèque non compressée invalide');
        }
      } catch (error) { errors.push(`${entry.name} : ${error.message}`); }
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
    for (const filename of files) {
      console.log(`[android-native] ${path.basename(filename)} : ${validateArtifact(filename, abis).join(', ')} ELF OK`);
      if (filename.endsWith('.aab')) console.log('[android-native] AAB : contrôler aussi les APK générés par bundletool (alignement ZIP), puis tester en mode 16 Ko.');
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { validateArtifact };
