// Conservative mechanical import cleanup. Keep all side-effect imports and JSX's React binding.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const files = [...new Set(execFileSync('git', ['ls-files', '--modified', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'))]
  .filter(file => /^(app|components|features|hooks|types|utils|store|services)\//.test(file) && /\.tsx?$/.test(file));
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
let count = 0;
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const original = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true);
  const used = new Set();
  function visit(node) {
    if (ts.isImportDeclaration(node) || (ts.isExportDeclaration(node) && node.moduleSpecifier)) return;
    if (ts.isIdentifier(node)) used.add(node.text);
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) used.add('React');
    ts.forEachChild(node, visit);
  }
  visit(source);
  const edits = [];
  for (const node of source.statements.filter(ts.isImportDeclaration)) {
    const clause = node.importClause;
    if (!clause) continue;
    const name = clause.name && used.has(clause.name.text) ? clause.name : undefined;
    let bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      const elements = bindings.elements.filter(element => used.has(element.name.text));
      bindings = elements.length ? ts.factory.updateNamedImports(bindings, elements) : undefined;
    } else if (bindings && !used.has(bindings.name.text)) bindings = undefined;
    if (name === clause.name && bindings === clause.namedBindings) continue;
    const updatedNode = ts.factory.updateImportDeclaration(node, node.modifiers,
      ts.factory.updateImportClause(clause, clause.isTypeOnly, name, bindings), node.moduleSpecifier, node.attributes);
    // The original leading comment is outside the replacement span; never print it twice.
    ts.setEmitFlags(updatedNode, ts.EmitFlags.NoLeadingComments);
    const replacement = name || bindings ? printer.printNode(ts.EmitHint.Unspecified, updatedNode, source) : '';
    if (replacement !== node.getText(source)) edits.push({ start: node.getStart(source), end: node.end, replacement });
  }
  if (!edits.length) continue;
  let updated = original;
  for (const edit of edits.sort((a, b) => b.start - a.start)) updated = updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end);
  if (fs.readFileSync(file, 'utf8') !== original) throw new Error(`File changed while processing: ${file}`);
  fs.writeFileSync(file, updated);
  count++;
}
console.log(`Cleaned imports in ${count} modules.`);
