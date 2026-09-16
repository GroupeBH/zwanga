// Replace huge destructurings by named domain results, updating references by symbol.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const file = process.argv[2];
const configFile = ts.readConfigFile('tsconfig.json', ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, process.cwd());
const program = ts.createProgram([path.resolve(file), ...config.fileNames.filter(name => name.endsWith('.d.ts'))], config.options);
const checker = program.getTypeChecker();
const source = program.getSourceFile(path.resolve(file));
const text = source.text;
const groups = {
  useRequestDetailController: 'model', useRequestDetailData: 'data',
  useRequestDetailFormState: 'form', useRequestAvailability: 'availability',
  useRequestEditValidation: 'validation', useRequestEditSchedule: 'schedule',
  useRequestDriverActions: 'driverActions', useRequestEditInitialization: 'editor',
  useRequestPassengerActions: 'passengerActions', buildRequestDetailPresentation: 'presentation',
};
for (const mapping of process.argv.slice(3)) {
  const [hook, group] = mapping.split('=');
  if (!hook || !/^[A-Za-z_$][\w$]*$/.test(group)) throw new Error('Expected hook=resultName');
  groups[hook] = group;
}
const symbols = new Map(), edits = [], declarations = new Set();
function collect(node) {
  if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) &&
      node.initializer && ts.isCallExpression(node.initializer)) {
    const group = groups[node.initializer.expression.getText(source)];
    if (group) {
      if (checker.resolveName(group, node, ts.SymbolFlags.Value, false)) throw new Error(`Name already in scope: ${group}`);
      for (const element of node.name.elements) {
        if (!ts.isIdentifier(element.name) || element.dotDotDotToken || element.initializer) throw new Error('Only plain destructuring supported');
        const symbol = checker.getSymbolAtLocation(element.name);
        symbols.set(symbol, { group, key: element.propertyName?.getText(source) || element.name.text });
      }
      declarations.add(node.name);
      edits.push({ start: node.name.getStart(source), end: node.name.end, replacement: group });
    }
  }
  ts.forEachChild(node, collect);
}
collect(source);
function visit(node) {
  if (declarations.has(node)) return;
  if (ts.isShorthandPropertyAssignment(node)) {
    const value = symbols.get(checker.getShorthandAssignmentValueSymbol(node));
    if (value) {
      edits.push({ start: node.getStart(source), end: node.end, replacement: `${node.name.text}: ${value.group}.${value.key}` });
      return;
    }
  }
  if (ts.isIdentifier(node)) {
    const value = symbols.get(checker.getSymbolAtLocation(node));
    if (value) edits.push({ start: node.getStart(source), end: node.end, replacement: `${value.group}.${value.key}` });
  }
  ts.forEachChild(node, visit);
}
visit(source);
let updated = text;
for (const edit of edits.sort((a, b) => b.start - a.start)) updated = updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end);
if (fs.readFileSync(file, 'utf8') !== text) throw new Error('Source changed during extraction');
fs.writeFileSync(file, updated);
console.log(`Named ${declarations.size} hook results in ${file}.`);
