const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const sourceRoots = [
  'app',
  'components',
  'config',
  'constants',
  'contexts',
  'hooks',
  'features',
  'services',
  'store',
  'types',
  'utils',
];
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const allowedFetchBaseQueryFiles = new Set([
  'store/api/authRefreshApi.ts',
  'store/api/baseApi.ts',
  'store/api/mapboxApi.ts',
]);

const violations = [];

function scanDirectory(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      scanDirectory(absolutePath);
      continue;
    }

    if (!sourceExtensions.has(path.extname(entry.name))) continue;

    const relativePath = path.relative(projectRoot, absolutePath).replaceAll('\\', '/');
    const source = fs.readFileSync(absolutePath, 'utf8');

    if (/\bfetch\s*\(/.test(source) || /\baxios\b/.test(source) || /\bXMLHttpRequest\b/.test(source)) {
      violations.push(`${relativePath}: appel HTTP direct interdit`);
    }

    if (/\bfetchBaseQuery\s*\(/.test(source) && !allowedFetchBaseQueryFiles.has(relativePath)) {
      violations.push(`${relativePath}: fetchBaseQuery doit être déclaré dans une couche réseau autorisée`);
    }
  }
}

for (const sourceRoot of sourceRoots) {
  const directory = path.join(projectRoot, sourceRoot);
  if (fs.existsSync(directory)) scanDirectory(directory);
}

if (violations.length > 0) {
  console.error('Frontière réseau non respectée :');
  violations.forEach((violation) => console.error(`- ${violation}`));
  process.exitCode = 1;
} else {
  console.log('Frontière réseau valide : aucun appel HTTP direct hors RTK Query.');
}
