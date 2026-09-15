// Mechanical AST extraction with unchanged bodies and explicit imports.
// Usage: node ... <source> <first declaration> <last declaration> <destination> [--write]
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const [sourcePath, firstName, lastName, destinationPath] = process.argv.slice(2);
const root = process.cwd();
const destination = path.resolve(destinationPath);
if (path.relative(root, destination).startsWith('..')) throw new Error('Target outside workspace');
if (fs.existsSync(destination)) throw new Error('Refusing to overwrite extracted module');
const text = fs.readFileSync(sourcePath, 'utf8').replaceAll('\r\n', '\n');
const source = ts.createSourceFile(sourcePath, text, ts.ScriptTarget.Latest, true);
const names = statement => statement.name ? [statement.name.getText(source)] :
  statement.declarationList?.declarations.flatMap(declaration => ts.isIdentifier(declaration.name) ? [declaration.name.text] : []) ?? [];
const firstIndex = source.statements.findIndex(statement => names(statement).includes(firstName));
const lastIndex = source.statements.findIndex(statement => names(statement).includes(lastName));
if (firstIndex < 0 || lastIndex < firstIndex) throw new Error('Declaration range not found');
const selected = source.statements.slice(firstIndex, lastIndex + 1);
const exported = selected.flatMap(names);
const originalBody = selected.map(statement => statement.getFullText(source)).join('');
const identifiers = new Set(originalBody.match(/\b[A-Za-z_$][\w$]*\b/g));
let body = selected.map(statement => {
  const raw = statement.getFullText(source);
  if (statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return raw;
  const leading = statement.getStart(source) - statement.pos;
  return raw.slice(0, leading) + 'export ' + raw.slice(leading);
}).join('').trim();
function relative(from, target) {
  let result = path.relative(path.dirname(from), target).replaceAll('\\', '/');
  if (!result.startsWith('.')) result = `./${result}`;
  return result;
}
const imports = source.statements.filter(ts.isImportDeclaration).flatMap(statement => {
  const clause = statement.importClause;
  if (!clause) return []; // Never duplicate a side-effect-only import.
  const parts = [];
  if (clause.name && identifiers.has(clause.name.text)) parts.push(clause.name.text);
  const binding = clause.namedBindings;
  if (binding && ts.isNamespaceImport(binding) && identifiers.has(binding.name.text)) parts.push(`* as ${binding.name.text}`);
  if (binding && ts.isNamedImports(binding)) {
    const elements = binding.elements.filter(element => identifiers.has(element.name.text));
    if (elements.length) parts.push(`{ ${elements.map(element => element.getText(source)).join(', ')} }`);
  }
  if (!parts.length) return [];
  const specifier = statement.moduleSpecifier.text;
  const module = specifier.startsWith('.') ? relative(destination, path.resolve(path.dirname(sourcePath), specifier)) : specifier;
  return [`import ${clause.isTypeOnly ? 'type ' : ''}${parts.join(', ')} from '${module}';`];
});
body = body.replace(/require\((['"])(\.[^'"]+)\1\)/g, (_match, quote, specifier) =>
  `require(${quote}${relative(destination, path.resolve(path.dirname(sourcePath), specifier))}${quote})`);
const content = `${imports.join('\n')}\n\n${body}\n`;
if (content.split('\n').length > 400) throw new Error(`Extracted module exceeds 400 lines: ${destinationPath}`);
const moduleName = relative(sourcePath, destination).replace(/\.tsx?$/, '');
const remaining = text.slice(0, selected[0].pos) + text.slice(selected.at(-1).end);
const publicExports = selected.filter(statement => statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword))
  .map(statement => `export ${ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement) ? 'type ' : ''}{ ${names(statement).join(', ')} } from '${moduleName}';`).join('\n');
const modified = `import { ${exported.join(', ')} } from '${moduleName}';\n${publicExports}${publicExports ? '\n' : ''}${remaining}`;
if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
  fs.writeFileSync(sourcePath, modified);
}
console.log(JSON.stringify({ source: sourcePath, destination: destinationPath, lines: content.split('\n').length,
  ...(process.argv.includes('--write') ? {} : { content, modified }) }));
