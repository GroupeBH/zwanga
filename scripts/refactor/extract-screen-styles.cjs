// AST-based mechanical extraction. Dry-run by default; --write applies the plan.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const roots = ['app', 'components', 'features'];
const files = [];
function scan(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = `${dir}/${entry.name}`;
    if (entry.isDirectory()) scan(file);
    else if (/\.tsx?$/.test(file) && fs.readFileSync(file, 'utf8').split('\n').length > 400) files.push(file);
  }
}
const target = process.argv.slice(2).find(argument => !argument.startsWith('--'));
if (target) files.push(target);
else roots.forEach(scan);
const config = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, process.cwd());
const program = ts.createProgram(files, parsed.options);
const checker = program.getTypeChecker();
const patch = ['*** Begin Patch'];
const report = [];
const writes = [];
const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
const print = node => printer.printNode(ts.EmitHint.Unspecified, node, node.getSourceFile());
function relativeImport(from, target) {
  let result = path.relative(path.dirname(from), target).replaceAll('\\', '/').replace(/\.tsx?$/, '');
  if (!result.startsWith('.')) result = `./${result}`;
  return result;
}
function rewriteImports(imports, from, destination, body) {
  const identifiers = new Set(body.match(/\b[A-Za-z_$][\w$]*\b/g));
  return imports.map(node => {
    const clause = node.importClause;
    const bindings = clause?.namedBindings;
    const named = bindings && ts.isNamedImports(bindings)
      ? ts.factory.updateNamedImports(bindings, bindings.elements.filter(element => identifiers.has(element.name.text)))
      : bindings;
    const name = clause?.name && identifiers.has(clause.name.text) ? clause.name : undefined;
    if (!name && named && ts.isNamedImports(named) && !named.elements.length) return '';
    const updated = clause ? ts.factory.updateImportDeclaration(node, node.modifiers,
      ts.factory.updateImportClause(clause, clause.isTypeOnly, name, named), node.moduleSpecifier, node.attributes) : node;
    let result = print(updated);
    const specifier = node.moduleSpecifier.text;
    if (specifier.startsWith('.')) result = result.replace(/(from\s*)['"][^'"]+['"]/, `$1${JSON.stringify(relativeImport(destination, path.resolve(path.dirname(from), specifier)))}`);
    return result;
  }).filter(Boolean).join('\n');
}
for (const file of files) {
  const source = program.getSourceFile(file);
  const text = source.text.replaceAll('\r\n', '\n');
  const normalized = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const styles = source.statements.find(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.length === 1 &&
    statement.declarationList.declarations[0].initializer && ts.isCallExpression(statement.declarationList.declarations[0].initializer) &&
    statement.declarationList.declarations[0].initializer.expression.getText(source) === 'StyleSheet.create');
  if (!styles) continue;
  const declaration = styles.declarationList.declarations[0];
  const object = declaration.initializer.arguments[0];
  if (!ts.isObjectLiteralExpression(object) || object.getText(source).split('\n').length < 120) continue;
  const imports = new Set();
  const localReferences = new Set();
  function inspect(node) {
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      for (const origin of symbol?.declarations ?? []) {
        if (origin.getSourceFile() !== source || (origin.pos >= object.pos && origin.end <= object.end)) continue;
        let parent = origin;
        while (parent.parent && parent.parent !== source) parent = parent.parent;
        if (ts.isImportDeclaration(parent)) imports.add(parent);
        else localReferences.add(node.text);
      }
    }
    ts.forEachChild(node, inspect);
  }
  inspect(declaration.initializer);
  if (localReferences.size) { report.push({ file, skipped: [...localReferences] }); continue; }
  const stem = file.replace(/\.tsx?$/, '').replaceAll('/[id]', '/detail').replaceAll('(tabs)', 'tabs');
  const destination = `features/screen-styles/${stem}`;
  const groups = [];
  let current = [], lines = 0;
  for (const property of object.properties) {
    const content = property.getFullText(source).trim().replaceAll('\r\n', '\n');
    const size = content.split('\n').length;
    if (lines + size > 290 && current.length) { groups.push(current); current = []; lines = 0; }
    current.push({ content, name: property.name?.getText(source).replace(/[^a-zA-Z0-9]/g, '') || 'layout' });
    lines += size;
  }
  if (current.length) groups.push(current);
  const aggregator = [];
  groups.forEach(group => {
    const name = group[0].name;
    const output = `${destination}/${name}.styles.ts`;
    const properties = group.map(item => `  ${item.content}`).join(',\n');
    const body = rewriteImports([...imports], file, output, `StyleSheet ${properties}`) + '\n\nexport const styles = StyleSheet.create({\n' + properties + '\n});\n';
    if (body.split('\n').length > 400) throw new Error(`Style group too large: ${output}`);
    patch.push(`*** Add File: ${output}`, ...body.trimEnd().split('\n').map(line => `+${line}`));
    writes.push([output, body]);
    aggregator.push({ name, output });
  });
  const styleExport = styles.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword) ? 'export ' : '';
  const index = `${destination}/index.ts`;
  const combined = aggregator.map(({ name, output }) => `import { styles as ${name}Styles } from '${relativeImport(index, output)}';`).join('\n') + '\n\nexport const styles = {\n' + aggregator.map(({ name }) => `  ...${name}Styles,`).join('\n') + '\n};\n';
  patch.push(`*** Add File: ${index}`, ...combined.trimEnd().split('\n').map(line => `+${line}`));
  writes.push([index, combined]);
  const normalizedStyles = normalized.statements.find(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations[0]?.name.getText(normalized) === declaration.name.getText(source));
  const old = normalizedStyles.getText(normalized);
  const binding = declaration.name.getText(source) === 'styles' ? 'styles' : `styles as ${declaration.name.getText(source)}`;
  const replacement = styleExport ? `export { ${binding} } from '${relativeImport(file, index)}';` : '';
  // Keep a local binding too: exported style modules sometimes use their styles internally.
  patch.push(`*** Update File: ${file}`, '@@', `+import { ${binding} } from '${relativeImport(file, index)}';`, ` ${text.split('\n')[0]}`);
  patch.push('@@', ...old.split('\n').map(line => `-${line}`), ...(replacement ? [`+${replacement}`] : []));
  writes.push([file, `import { ${binding} } from '${relativeImport(file, index)}';\n${text.replace(old, replacement)}`]);
  report.push({ file, extractedLines: old.split('\n').length, groups: groups.length });
}
patch.push('*** End Patch');
if (process.argv.includes('--write')) {
  for (const [file, content] of writes) {
    if (file.startsWith('features/screen-styles/') && fs.existsSync(file)) throw new Error(`Refusing to overwrite extracted module: ${file}`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  process.stdout.write(JSON.stringify(report));
} else process.stdout.write(JSON.stringify({ patch: patch.join('\n'), report }));
