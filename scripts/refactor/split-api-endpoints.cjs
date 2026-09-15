// Keep API injection and exported hooks stable; move only independent endpoint factories.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const file = process.argv[2];
const destination = process.argv[3];
const text = fs.readFileSync(file, 'utf8').replaceAll('\r\n', '\n');
const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
const apiStatement = source.statements.find(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
  declaration.initializer && ts.isCallExpression(declaration.initializer) && declaration.initializer.expression.getText(source) === 'baseApi.injectEndpoints'));
if (!apiStatement) throw new Error('API injection not found');
const api = apiStatement.declarationList.declarations[0];
const options = api.initializer.arguments[0];
const endpointProperty = options.properties.find(property => property.name?.getText(source) === 'endpoints');
const arrow = endpointProperty.initializer;
const object = ts.isParenthesizedExpression(arrow.body) ? arrow.body.expression : arrow.body;
if (!ts.isObjectLiteralExpression(object)) throw new Error('Endpoint object not found');
const groups = [];
let current = [], lines = 0;
for (const property of object.properties) {
  const body = property.getFullText(source).trim();
  // Cache patch callbacks referencing this very API stay beside the injection, avoiding cycles.
  if (body.includes(`${api.name.getText(source)}.`)) continue;
  const size = body.split('\n').length;
  if (lines + size > 240 && current.length) { groups.push(current); current = []; lines = 0; }
  current.push(property); lines += size;
}
if (current.length) groups.push(current);
const imports = source.statements.filter(ts.isImportDeclaration);
const replacements = [];
const outputs = [];
const additions = [];
for (const group of groups) {
  const name = group[0].name.getText(source);
  const factory = `build${name[0].toUpperCase()}${name.slice(1)}Endpoints`;
  const target = `${destination}/${name}.endpoints.ts`;
  const body = group.map(property => property.getFullText(source).trim()).join(',\n');
  const used = new Set(`BaseEndpointBuilder ${body}`.match(/\b[A-Za-z_$][\w$]*\b/g));
  const copied = imports.flatMap(node => {
    const clause = node.importClause;
    if (!clause) return [];
    const parts = [];
    if (clause.name && used.has(clause.name.text)) parts.push(clause.name.text);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings) && used.has(bindings.name.text)) parts.push(`* as ${bindings.name.text}`);
    if (bindings && ts.isNamedImports(bindings)) {
      const elements = bindings.elements.filter(element => used.has(element.name.text));
      if (elements.length) parts.push(`{ ${elements.map(element => element.getText(source)).join(', ')} }`);
    }
    if (!parts.length) return [];
    let specifier = node.moduleSpecifier.text;
    if (specifier.startsWith('.')) {
      specifier = path.relative(path.dirname(target), path.resolve(path.dirname(file), specifier)).replaceAll('\\', '/');
      if (!specifier.startsWith('.')) specifier = `./${specifier}`;
    }
    return [`import ${clause.isTypeOnly ? 'type ' : ''}${parts.join(', ')} from '${specifier}';`];
  });
  const content = `${copied.join('\n')}\n\nexport function ${factory}(builder: BaseEndpointBuilder) {\n  return {\n${body}\n  };\n}\n`;
  if (content.split('\n').length > 400) throw new Error(`Endpoint group exceeds limit: ${target}`);
  if (fs.existsSync(target)) throw new Error(`Refusing to overwrite: ${target}`);
  outputs.push([target, content]);
  const module = path.relative(path.dirname(file), target).replaceAll('\\', '/').replace(/\.ts$/, '');
  additions.push(`import { ${factory} } from '${module.startsWith('.') ? module : `./${module}`}';`);
  group.forEach((property, index) => replacements.push({ start: property.getStart(source), end: property.end,
    text: index === 0 ? `...${factory}(builder)` : '' }));
}
// Rebuild properties instead of leaving empty commas in an object literal.
const replaced = new Map(replacements.map(replacement => [replacement.start, replacement.text]));
const properties = object.properties.map(property => replaced.has(property.getStart(source))
  ? replaced.get(property.getStart(source)) : property.getText(source)).filter(Boolean);
const updated = `${additions.join('\n')}\n${text.slice(0, object.getStart(source))}{\n    ${properties.join(',\n    ')},\n  }${text.slice(object.end)}`;
if (process.argv.includes('--write')) {
  for (const [target, content] of outputs) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); }
  fs.writeFileSync(file, updated);
}
console.log(JSON.stringify({ file, lines: updated.split('\n').length, modules: outputs.map(([target, content]) => ({ target, lines: content.split('\n').length })) }));
