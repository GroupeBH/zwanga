// Move the GPS callback and its per-subscription throttles together.
// Cancellation remains live through a getter closing over the owning effect.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const file = 'app/trip/navigate/[id].tsx';
const target = 'features/driver-navigation/driverLocationListener.ts';
if (fs.existsSync(target)) throw new Error('Listener already extracted');
const text = fs.readFileSync(file, 'utf8');
const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let first, last, callback, heading;
function visit(node) {
  if (ts.isVariableStatement(node)) {
    const names = node.declarationList.declarations.map(value => value.name.getText(source));
    if (names.includes('lastStateUpdateTime')) first = node;
    if (names.includes('STEP_CHECK_INTERVAL')) last = node;
    if (names.includes('normalizeHeading')) heading = node;
  }
  if (ts.isCallExpression(node) && node.expression.getText(source) === 'Location.watchPositionAsync' &&
      node.arguments[1]?.parameters?.[0]?.name.getText(source) === 'newLocation') callback = node.arguments[1];
  ts.forEachChild(node, visit);
}
visit(source);
if (!first || !last || !callback || !heading) throw new Error('Expected GPS declarations not found');
const parameters = `interface Params {
  data: ReturnType<typeof useDriverNavigationData>;
  mapState: ReturnType<typeof useDriverNavigationMapState>;
  refs: ReturnType<typeof useDriverNavigationRefs>;
  sendDriverLocationToTracking: (location: Location.LocationObject) => void;
  isCancelled: () => boolean;
}`;
let callbackText = callback.getText(source);
const cancelEdits = [];
function cancellations(node) {
  if (ts.isIdentifier(node) && node.text === 'locationEffectCancelled') cancelEdits.push(node);
  ts.forEachChild(node, cancellations);
}
cancellations(callback);
for (const node of cancelEdits.sort((a, b) => b.pos - a.pos)) {
  const start = node.getStart(source) - callback.getStart(source), end = node.end - callback.getStart(source);
  callbackText = callbackText.slice(0, start) + 'isCancelled()' + callbackText.slice(end);
}
const constants = text.slice(first.getStart(source), last.end);
const body = `${parameters}\n\nexport ${heading.getText(source)}\n\nexport function createDriverLocationListener({ data, mapState, refs, sendDriverLocationToTracking, isCancelled }: Params) {\n${constants}\nreturn ${callbackText};\n}\n`;
const used = new Set(body.match(/\b[A-Za-z_$][\w$]*\b/g));
function relative(targetFile, moduleFile) {
  const value = path.relative(path.dirname(targetFile), moduleFile).replaceAll('\\', '/');
  return value.startsWith('.') ? value : `./${value}`;
}
const imports = source.statements.filter(ts.isImportDeclaration).flatMap(node => {
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
  let module = node.moduleSpecifier.text;
  if (module.startsWith('.')) module = relative(target, path.resolve(path.dirname(file), module));
  return [`import ${clause.isTypeOnly ? 'type ' : ''}${parts.join(', ')} from '${module}';`];
});
const raw = imports.join('\n') + '\n\n' + body;
const content = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed }).printFile(ts.createSourceFile(target, raw, ts.ScriptTarget.Latest, true));
if (content.split('\n').length > 400) throw new Error('Listener exceeds 400 lines');
const edits = [
  { start: first.getStart(source), end: last.end, replacement: '' },
  { start: heading.getStart(source), end: heading.end, replacement: '' },
  { start: callback.getStart(source), end: callback.end, replacement: 'createDriverLocationListener({ data, mapState, refs, sendDriverLocationToTracking, isCancelled: () => locationEffectCancelled })' },
];
let updated = text;
for (const edit of edits.sort((a, b) => b.start - a.start)) updated = updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end);
updated = `import { createDriverLocationListener, normalizeHeading } from '../../../features/driver-navigation/driverLocationListener';\n${updated}`;
fs.writeFileSync(target, content);
fs.writeFileSync(file, updated);
console.log(`GPS callback extracted: ${content.split('\n').length} lines`);
