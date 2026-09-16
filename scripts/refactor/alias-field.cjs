// Preserve field values in a render-local const so narrowing survives callbacks.
const fs = require('node:fs');
const ts = require('typescript');
const [file, field, alias] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8');
const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const edits = [];
let owner;
function visit(node) {
  if (ts.isPropertyAccessExpression(node) && node.getText(source) === field) {
    let parent = node;
    while (parent && !(ts.isFunctionDeclaration(parent) && parent.parent === source)) parent = parent.parent;
    if (!parent) throw new Error('Expected a top-level function owner');
    if (owner && parent !== owner) throw new Error('Multiple scopes');
    owner = parent;
    edits.push({ start: node.getStart(source), end: node.end, replacement: alias });
    return;
  }
  ts.forEachChild(node, visit);
}
visit(source);
if (!owner || !edits.length) throw new Error('No field uses found');
const root = field.split('.')[0];
const declaration = owner.body.statements.find(node => ts.isVariableStatement(node) &&
  node.declarationList.declarations.some(value => value.name.getText(source) === root));
const position = declaration ? declaration.end : owner.body.getStart(source) + 1;
const guard = process.argv.includes('--guard') ? `\n  if (!${alias}) return null;` : '';
edits.push({ start: position, end: position, replacement: `\n  const ${alias} = ${field};${guard}` });
let updated = text;
for (const edit of edits.sort((a, b) => b.start - a.start)) updated = updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end);
fs.writeFileSync(file, updated);
