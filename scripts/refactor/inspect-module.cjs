const fs = require('node:fs');
const ts = require('typescript');
const file = process.argv[2];
const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
const line = position => source.getLineAndCharacterOfPosition(position).line + 1;
function describe(node, depth = 0) {
  const name = node.name?.getText(source) || node.declarationList?.declarations
    .map(declaration => declaration.name.getText(source)).join(', ') || node.getText(source).split('\n')[0].slice(0, 100);
  console.log(`${'  '.repeat(depth)}${line(node.getStart(source))}-${line(node.end)} ${name}`);
  if (node.body && ts.isBlock(node.body) && depth < 1) {
    for (const child of node.body.statements) describe(child, depth + 1);
  }
}
for (const statement of source.statements.filter(node => !ts.isImportDeclaration(node))) describe(statement);
