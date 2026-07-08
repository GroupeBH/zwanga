#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const filePath = path.join(
  process.cwd(),
  'node_modules',
  'react-native',
  'ReactAndroid',
  'src',
  'main',
  'java',
  'com',
  'facebook',
  'react',
  'uimanager',
  'ViewGroupDrawingOrderHelper.kt',
);

const vulnerableBlock = `      update()
    }

    if (currentDrawingOrderIndices == null) {`;

const patchedBlock = `      update()
      currentDrawingOrderIndices = this.drawingOrderIndices
    }

    if (currentDrawingOrderIndices == null) {`;

if (!fs.existsSync(filePath)) {
  console.error(`[patch-react-native-drawing-order] File not found: ${filePath}`);
  process.exit(1);
}

const source = fs.readFileSync(filePath, 'utf8');

if (source.includes(patchedBlock)) {
  console.log('[patch-react-native-drawing-order] React Native drawing order patch already applied.');
  process.exit(0);
}

if (!source.includes(vulnerableBlock)) {
  console.error(
    '[patch-react-native-drawing-order] Expected React Native drawing order block not found. ' +
      'Check whether the upstream implementation changed.',
  );
  process.exit(1);
}

fs.writeFileSync(filePath, source.replace(vulnerableBlock, patchedBlock));
console.log('[patch-react-native-drawing-order] React Native drawing order patch applied.');
