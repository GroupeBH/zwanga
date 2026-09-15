const fs = require('node:fs');
const path = require('node:path');

// Handwritten mobile sources. Dependencies, native generated projects, documentation,
// lockfiles and test fixtures are not application implementation modules.
const sourceRoots = ['app', 'components', 'config', 'constants', 'contexts', 'features', 'hooks', 'lib', 'services', 'store', 'types', 'utils'];
const maximum = 400;
const oversized = [];
let checked = 0;
function inspect(directory) {
  if (!fs.existsSync(directory)) return;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (/\.[jt]sx?$/.test(entry.name)) {
      checked++;
      const lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length;
      if (lines > maximum) oversized.push({ file: file.replaceAll('\\', '/'), lines });
    }
  }
}
sourceRoots.forEach(inspect);
oversized.sort((a, b) => b.lines - a.lines);
if (process.argv.includes('--json')) {
  process.stdout.write(JSON.stringify({ maximum, checked, oversized }, null, 2) + '\n');
} else {
  for (const entry of oversized) console.error(`${entry.file}: ${entry.lines} lignes (maximum ${maximum})`);
  console.log(`${checked} sources contrôlées ; ${oversized.length} fichier(s) au-dessus de ${maximum} lignes.`);
}
if (oversized.length) process.exitCode = 1;
