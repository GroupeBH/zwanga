// Body-preserving extraction of contiguous component statements, with explicit closure inputs.
// Refuses forward dependencies and writes to captured locals; refs/setters keep their semantics.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const [file, firstName, lastName, name, target] = process.argv.slice(2);
if (fs.existsSync(target)) throw new Error(`Refusing to overwrite ${target}`);
const configFile = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
const program = ts.createProgram(config.fileNames, config.options);
const checker = program.getTypeChecker();
const source = program.getSourceFile(path.resolve(file));
const text = source.text;
const component = source.statements.find(node => ts.isFunctionDeclaration(node) && node.body &&
  node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword));
if (!component) throw new Error('Default function component not found');
function names(node) {
  if (ts.isIdentifier(node)) return [node.text];
  if (ts.isObjectBindingPattern(node) || ts.isArrayBindingPattern(node)) return node.elements.flatMap(element => ts.isBindingElement(element) ? names(element.name) : []);
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.flatMap(declaration => names(declaration.name));
  return [];
}
const statements = component.body.statements;
let first = statements.findIndex(node => names(node).includes(firstName));
let last = statements.findIndex(node => names(node).includes(lastName));
if (first < 0 || last < first) throw new Error('Invalid declaration range');
const isEffect = node => node && ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
  /^(React\.)?useEffect$/.test(node.expression.expression.getText(source));
if (process.argv.includes('--leading-effects')) while (isEffect(statements[first - 1])) first--;
if (process.argv.includes('--following-effects')) while (isEffect(statements[last + 1])) last++;
const selected = statements.slice(first, last + 1);
const start = selected[0].getStart(source), end = selected.at(-1).end;
const captures = new Map(), capturedImports = new Set(), outputs = new Set();
const isInside = node => node.getSourceFile() === source && node.getStart(source) >= start && node.end <= end;
function inComponent(node) {
  for (let parent = node; parent; parent = parent.parent) if (parent === component) return true;
  return false;
}
function hookResultType(declaration) {
  if (!ts.isBindingElement(declaration)) return null;
  const pattern = declaration.parent;
  const variable = pattern.parent;
  if (!ts.isVariableDeclaration(variable) || !variable.initializer || !ts.isCallExpression(variable.initializer)) return null;
  const callee = variable.initializer.expression;
  if (!ts.isIdentifier(callee) || !callee.text.startsWith('use')) return null;
  const index = ts.isArrayBindingPattern(pattern) ? pattern.elements.indexOf(declaration)
    : `'${declaration.propertyName?.getText(source) || declaration.name.getText(source)}'`;
  capturedImports.add(callee.text);
  return `ReturnType<typeof ${callee.text}>[${index}]`;
}
function collect(node) {
  if (ts.isIdentifier(node)) {
    const property = (ts.isPropertyAccessExpression(node.parent) && node.parent.name === node) ||
      ((ts.isPropertyAssignment(node.parent) || ts.isJsxAttribute(node.parent)) && node.parent.name === node);
    const symbol = ts.isShorthandPropertyAssignment(node.parent)
      ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
    const declaration = symbol?.valueDeclaration;
    if (!property && declaration && !isInside(declaration) && inComponent(declaration)) {
      if (declaration.end > start) throw new Error(`Forward dependency: ${symbol.name}`);
      if (ts.isBinaryExpression(node.parent) && node.parent.left === node &&
          node.parent.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
          node.parent.operatorToken.kind <= ts.SyntaxKind.LastAssignment) throw new Error(`Writes to captured local: ${symbol.name}`);
      const type = checker.getTypeOfSymbolAtLocation(symbol, selected[0]);
      let rendered = declaration.type?.getText(source) || checker.typeToString(type, node,
        ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope);
      if (rendered.includes('MutationTrigger<') || rendered.length > 350 || ['refetch', 'showDialog'].includes(symbol.name)) {
        rendered = hookResultType(declaration) || rendered;
      }
      if (rendered.length > 1000) throw new Error(`Type needs an explicit domain contract: ${symbol.name}`);
      captures.set(symbol.name, rendered);
    }
  }
  ts.forEachChild(node, collect);
}
selected.forEach(collect);
const locals = new Set(selected.flatMap(names));
function findOutput(node) {
  if (isInside(node)) return;
  if (ts.isIdentifier(node) && locals.has(node.text)) {
    const symbol = ts.isShorthandPropertyAssignment(node.parent)
      ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
    if (symbol?.valueDeclaration && isInside(symbol.valueDeclaration)) outputs.add(node.text);
  }
  ts.forEachChild(node, findOutput);
}
findOutput(component);
const body = text.slice(start, end).split('\n').map((line, index) => index ? line.replace(/^  /, '') : line).join('\n');
const used = new Set(`${body}\n${[...captures.values()].join('\n')} React ${[...capturedImports].join(' ')}`.match(/\b[A-Za-z_$][\w$]*\b/g));
function relative(from, to) {
  const result = path.relative(path.dirname(from), to).replaceAll('\\', '/');
  return result.startsWith('.') ? result : `./${result}`;
}
const copiedImports = source.statements.filter(ts.isImportDeclaration).flatMap(statement => {
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
for (const [module, types] of Object.entries({
  '@/types': ['Trip', 'Vehicle', 'Booking', 'User', 'TripRequest', 'Conversation', 'Review', 'DriverOffer'],
  'react-native-safe-area-context': ['EdgeInsets'], '@/utils/tripCoordinates': ['MapCoordinate'],
  'expo-router': ['Router'],
})) {
  const missing = types.filter(type => used.has(type) && !copiedImports.some(value => new RegExp(`\\b${type}\\b`).test(value)));
  if (missing.length) copiedImports.push(`import type { ${missing.join(', ')} } from '${module}';`);
}
const props = [...captures].map(([key, type]) => `  ${key}: ${type};`).join('\n');
const parameters = [...captures.keys()].map(key => `  ${key},`).join('\n');
const returns = [...outputs].map(key => `    ${key},`).join('\n');
const content = `${copiedImports.join('\n')}\n\ninterface Params {\n${props}\n}\n\nexport function ${name}({\n${parameters}\n}: Params) {\n${body.split('\n').map(line => line ? `  ${line}` : '').join('\n')}\n\n  return {\n${returns}\n  };\n}\n`;
if (content.split('\n').length > 400) throw new Error(`New module exceeds 400 lines (${content.split('\n').length})`);
const result = outputs.size ? `const { ${[...outputs].join(', ')} } = ` : '';
const replacement = `${result}${name}({\n${[...captures.keys()].map(key => `    ${key},`).join('\n')}\n  });`;
const updated = `import { ${name} } from '${relative(file, path.resolve(target)).replace(/\.tsx?$/, '')}';\n${text.slice(0, start)}${replacement}${text.slice(end)}`;
if (process.argv.includes('--write')) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content); fs.writeFileSync(file, updated);
}
console.log(JSON.stringify({ target, inputs: [...captures.keys()], outputs: [...outputs], lines: content.split('\n').length,
  ...(process.argv.includes('--write') ? {} : { content }) }));
