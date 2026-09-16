// Remove generated empty parameter contracts and their redundant {} arguments.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const files = [...new Set(execFileSync('git', ['ls-files', '--modified', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'))]
  .filter(file => /^(app|components|features|hooks)\//.test(file) && /\.tsx?$/.test(file));
const names = new Set();
function apply(file, text, edits) {
  for (const edit of edits.sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.replacement + text.slice(edit.end);
  fs.writeFileSync(file, text);
}
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const contract = source.statements.find(node => ts.isInterfaceDeclaration(node) && node.name.text === 'Params' && node.members.length === 0);
  if (!contract) continue;
  const functions = source.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text.startsWith('use') &&
    node.parameters.length === 1 && ts.isObjectBindingPattern(node.parameters[0].name) && node.parameters[0].name.elements.length === 0 && node.parameters[0].type?.getText(source) === 'Params');
  if (!functions.length) continue;
  const edits = [{ start: contract.getStart(source), end: contract.end, replacement: '' }];
  for (const fn of functions) {
    names.add(fn.name.text);
    edits.push({ start: fn.parameters[0].getStart(source), end: fn.parameters[0].end, replacement: '' });
  }
  apply(file, text, edits);
}
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const edits = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && names.has(node.expression.text) &&
        !node.typeArguments && node.arguments.length === 1 && ts.isObjectLiteralExpression(node.arguments[0]) && !node.arguments[0].properties.length) {
      edits.push({ start: node.getStart(source), end: node.end, replacement: `${node.expression.text}()` });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (edits.length) apply(file, text, edits);
}
console.log(`Simplified ${names.size} argument-free hooks.`);
