const fs = require('node:fs');
const ts = require('typescript');
const file = process.argv[2];
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const line = position => source.getLineAndCharacterOfPosition(position).line + 1;
function visit(node) {
  if (ts.isJsxElement(node)) {
    const first = line(node.getStart(source));
    const last = line(node.end);
    if (last - first >= Number(process.argv[3] || 40)) {
      console.log(`${first}-${last} (${last - first + 1}) ${node.openingElement.getText(source).replace(/\s+/g, ' ').slice(0, 180)}`);
    }
  }
  ts.forEachChild(node, visit);
}
visit(source);
