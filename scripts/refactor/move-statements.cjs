// Reorder a reviewed, contiguous group of declarations without rewriting their bodies.
// Use only after checking that dependencies and hook/effect order remain valid.
const fs = require('node:fs');
const ts = require('typescript');
const [file, firstName, lastName, beforeName] = process.argv.slice(2);
const text = fs.readFileSync(file, 'utf8');
const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.body &&
  node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
function names(node) {
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) return node.elements.flatMap(element => ts.isBindingElement(element) ? names(element.name) : []);
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.flatMap(declaration => names(declaration.name));
  return [];
}
const statements = component.body.statements;
const first = statements.findIndex(node => names(node).includes(firstName));
const last = statements.findIndex(node => names(node).includes(lastName));
const before = statements.findIndex(node => names(node).includes(beforeName));
if (first < 0 || last < first || before < 0 || (before >= first && before <= last)) throw new Error('Invalid move');
const start = statements[first].getFullStart(), end = statements[last].end;
const position = statements[before].getFullStart();
const block = text.slice(start, end);
const edits = [{ start, end, replacement: '' }, { start: position, end: position, replacement: block }];
let updated = text;
for (const edit of edits.sort((a, b) => b.start - a.start)) updated = updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end);
fs.writeFileSync(file, updated);
