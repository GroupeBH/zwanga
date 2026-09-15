// Restore the symbolic annotation after TypeScript expands an inferred icon union.
const fs = require('node:fs');
const ts = require('typescript');
const file = 'features/trip-detail/TripSummary.tsx';
const text = fs.readFileSync(file, 'utf8');
const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
let target;
function visit(node) {
  if (ts.isPropertySignature(node) && node.name.getText(source) === 'tripVehicleIconName' &&
      ts.isUnionTypeNode(node.type) && node.type.types.length > 100) target = node.type;
  ts.forEachChild(node, visit);
}
visit(source);
if (target) fs.writeFileSync(file, text.slice(0, target.getStart(source)) + 'keyof typeof Ionicons.glyphMap' + text.slice(target.end));
