const fs = require('fs');
const path = require('path');

const targetPath = path.join(
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

const marker = 'ZWANGA_DRAWING_ORDER_GUARD';

if (!fs.existsSync(targetPath)) {
  throw new Error(`[drawing-order-patch] React Native source not found: ${targetPath}`);
}

const source = fs.readFileSync(targetPath, 'utf8');

if (source.includes(marker)) {
  console.log('[drawing-order-patch] Already applied.');
  process.exit(0);
}

const targetPattern = /    return currentDrawingOrderIndices\[index\]\r?\n/;

if (!targetPattern.test(source)) {
  throw new Error(
    '[drawing-order-patch] Expected React Native drawing-order code was not found. Review the patch for this React Native version.',
  );
}

const lineEnding = source.includes('\r\n') ? '\r\n' : '\n';
const replacement = [
  `    // ${marker}: child mutations can invalidate the cached index during Android drawing.`,
  '    val drawingIndex = currentDrawingOrderIndices.getOrNull(index) ?: index',
  '    if (childCount <= 0) {',
  '      return 0',
  '    }',
  '    return if (drawingIndex in 0 until childCount) {',
  '      drawingIndex',
  '    } else {',
  '      index.coerceIn(0, childCount - 1)',
  '    }',
  '',
].join(lineEnding);

fs.writeFileSync(targetPath, source.replace(targetPattern, replacement), 'utf8');
console.log('[drawing-order-patch] Applied React Native Android drawing-order guard.');
