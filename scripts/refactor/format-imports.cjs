// Formatting only: readable imports and removal of gaps left by import extraction.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const files = [...new Set(execFileSync('git', ['ls-files', '--modified', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'))]
  .filter(file => /^(app|components|features|hooks|types|store)\//.test(file) && /\.tsx?$/.test(file));
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const text = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const imports = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) break;
    imports.push(statement);
  }
  if (!imports.length) continue;
  const formatted = imports.map(node => {
    const raw = node.getText(source);
    const bindings = node.importClause?.namedBindings;
    if (raw.length <= 120 || !bindings || !ts.isNamedImports(bindings)) return raw;
    const start = bindings.getStart(source) - node.getStart(source);
    const end = bindings.end - node.getStart(source);
    return raw.slice(0, start) + '{\n' + bindings.elements.map(element => `  ${element.getText(source)},`).join('\n') + '\n}' + raw.slice(end);
  }).join('\n');
  const updated = text.slice(0, imports[0].getStart(source)) + formatted + '\n\n' + text.slice(imports.at(-1).end).trimStart();
  if (text !== updated) fs.writeFileSync(file, updated);
}
