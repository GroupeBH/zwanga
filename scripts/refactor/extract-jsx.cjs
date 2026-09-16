// Extract a selected JSX subtree without changing its body or captured values.
// Usage: <source> <first line> <last line> <ComponentName> <destination> [--write]
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const [file, first, last, name, target] = process.argv.slice(2);
if (!file || !target) throw new Error('Source, line range, component name and target are required');
if (fs.existsSync(target)) throw new Error(`Refusing to overwrite ${target}`);
const configFile = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
const program = ts.createProgram([path.resolve(file), ...config.fileNames.filter(name => name.endsWith('.d.ts'))], config.options);
const source = program.getSourceFile(path.resolve(file));
const checker = program.getTypeChecker();
const text = source.text;
const line = position => source.getLineAndCharacterOfPosition(position).line + 1;
let selected;
function locate(node) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
    const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxFragment(node) ? node.openingFragment : node;
    const matches = last === '*' ? opening.getText(source).includes(first)
      : line(node.getStart(source)) === Number(first) && line(node.end) === Number(last);
    if (matches) {
      if (selected) throw new Error('Selection must match exactly one subtree');
      selected = node;
    }
  }
  ts.forEachChild(node, locate);
}
locate(source);
if (!selected) throw new Error('No JSX subtree matches these exact lines');
const start = selected.getStart(source), end = selected.end;
const imports = source.statements.filter(ts.isImportDeclaration);
const importSymbols = new Set();
for (const declaration of imports) {
  function bindings(node) {
    if (ts.isIdentifier(node)) { const symbol = checker.getSymbolAtLocation(node); if (symbol) importSymbols.add(symbol); }
    ts.forEachChild(node, bindings);
  }
  if (declaration.importClause) bindings(declaration.importClause);
}
const captures = new Map();
function hookResultType(declaration) {
  if (ts.isVariableDeclaration(declaration) && declaration.initializer && ts.isCallExpression(declaration.initializer) &&
      ts.isIdentifier(declaration.initializer.expression) && declaration.initializer.expression.text.startsWith('use')) {
    return `ReturnType<typeof ${declaration.initializer.expression.text}>`;
  }
  if (!ts.isBindingElement(declaration)) return null;
  const pattern = declaration.parent;
  const variable = pattern.parent;
  if (!ts.isVariableDeclaration(variable) || !variable.initializer || !ts.isCallExpression(variable.initializer)) return null;
  const callee = variable.initializer.expression;
  if (!ts.isIdentifier(callee) || !callee.text.startsWith('use')) return null;
  const index = ts.isArrayBindingPattern(pattern) ? pattern.elements.indexOf(declaration)
    : `'${declaration.propertyName?.getText(source) || declaration.name.getText(source)}'`;
  return `ReturnType<typeof ${callee.text}>[${index}]`;
}
function collect(node) {
  if (ts.isIdentifier(node)) {
    const symbol = ts.isShorthandPropertyAssignment(node.parent)
      ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
    const declaration = symbol?.valueDeclaration;
    // Property names and JSX attributes are not closure captures.
    const isProperty = (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
      ((ts.isPropertyAssignment(node.parent) || ts.isJsxAttribute(node.parent)) && node.parent.name === node);
    if (!isProperty && symbol && declaration && declaration.getSourceFile() === source &&
        !(declaration.getStart(source) >= start && declaration.end <= end) && !importSymbols.has(symbol)) {
      const valueSymbol = symbol;
      if (importSymbols.has(valueSymbol)) return;
      const valueDeclaration = valueSymbol.valueDeclaration;
      if (valueDeclaration && valueDeclaration.getStart(source) >= start && valueDeclaration.end <= end) return;
      // Extract top-level helpers first so components never import their parent route.
      let topLevel = valueDeclaration;
      while (topLevel?.parent && topLevel.parent !== source) topLevel = topLevel.parent;
      if (topLevel && !(ts.isFunctionDeclaration(topLevel) && topLevel.body && valueDeclaration !== topLevel)) {
        throw new Error(`Move the module-level dependency ${valueSymbol.name} before extracting JSX`);
      }
      const type = checker.getTypeOfSymbolAtLocation(valueSymbol, selected);
      let rendered = valueDeclaration?.type?.getText(source) || checker.typeToString(type, node,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope);
      if (rendered.length > 350) rendered = hookResultType(valueDeclaration) || rendered;
      if (rendered.length > 1200) throw new Error(`Type needs a domain contract: ${valueSymbol.name}`);
      captures.set(valueSymbol.name, rendered);
    }
  }
  ts.forEachChild(node, collect);
}
collect(selected);
const body = selected.getText(source);
const used = new Set(`${body}\n${[...captures.values()].join('\n')} React`.match(/\b[A-Za-z_$][\w$]*\b/g));
function relative(from, to) {
  const result = path.relative(path.dirname(from), to).replaceAll('\\', '/');
  return result.startsWith('.') ? result : `./${result}`;
}
const copiedImports = imports.flatMap(statement => {
  const clause = statement.importClause;
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
  let specifier = statement.moduleSpecifier.text;
  if (specifier.startsWith('.')) specifier = relative(target, path.resolve(path.dirname(file), specifier));
  return [`import ${clause.isTypeOnly ? 'type ' : ''}${parts.join(', ')} from '${specifier}';`];
});
// Inferred hook results can name types not explicitly imported by the parent screen.
const knownTypes = {
  '@/types': ['Trip', 'Vehicle', 'Booking', 'User', 'TripRequest', 'Conversation', 'Review', 'DriverOffer'],
  'react-native-safe-area-context': ['EdgeInsets'],
  '@/utils/tripCoordinates': ['MapCoordinate'],
  'expo-router': ['Router'],
};
for (const [module, names] of Object.entries(knownTypes)) {
  const missing = names.filter(type => used.has(type) && !copiedImports.some(value => new RegExp(`\\b${type}\\b`).test(value)));
  if (missing.length) copiedImports.push(`import type { ${missing.join(', ')} } from '${module}';`);
}
const props = [...captures].map(([key, type]) => `  ${key}: ${type};`).join('\n');
const parameters = [...captures.keys()].map(key => `  ${key},`).join('\n');
const indent = ' '.repeat(source.getLineAndCharacterOfPosition(start).character);
const jsx = body.split('\n').map((value, index) => index ? value.replace(new RegExp(`^${indent}`), '') : value).join('\n');
const content = `${copiedImports.join('\n')}\n\ninterface ${name}Props {\n${props}\n}\n\nexport function ${name}({\n${parameters}\n}: ${name}Props) {\n  return (\n${jsx.split('\n').map(value => value ? `    ${value}` : '').join('\n')}\n  );\n}\n`;
if (content.split('\n').length > 400) throw new Error(`${name} would exceed 400 lines (${content.split('\n').length})`);
const replacement = captures.size ? `<${name}\n${[...captures.keys()].map(key => `${indent}  ${key}={${key}}`).join('\n')}\n${indent}/>` : `<${name} />`;
const updated = `import { ${name} } from '${relative(file, path.resolve(target)).replace(/\.tsx?$/, '')}';\n${text.slice(0, start)}${replacement}${text.slice(end)}`;
if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  fs.writeFileSync(file, updated);
}
console.log(JSON.stringify({ target, captures: [...captures.keys()], lines: content.split('\n').length,
  ...(process.argv.includes('--write') ? {} : { content }) }));
