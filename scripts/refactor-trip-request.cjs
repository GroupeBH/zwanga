// One-shot, read-only extraction plan; writes are applied separately with apply_patch.
const ts = require('typescript');
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const file = path.join(root, 'app/request/index.tsx');
const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const program = ts.createProgram([file], { jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ESNext, noResolve: true });
const checker = program.getTypeChecker();
// Use the program's source so checker symbols retain their identity.
const sf = program.getSourceFile(file);
const original = sf.text;
const text = (node) => node.getText(sf).replace(/\r\n/g, '\n');
const imports = sf.statements.filter(ts.isImportDeclaration).map(text).join('\n');
const screen = sf.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'RequestTripScreen');
const returned = screen.body.statements.find(ts.isReturnStatement);
const localSymbols = new Map();
for (const statement of screen.body.statements) {
  const collect = (name) => {
    if (ts.isIdentifier(name)) localSymbols.set(checker.getSymbolAtLocation(name), name.text);
    else name.elements?.forEach((part) => part.name && collect(part.name));
  };
  if (ts.isVariableStatement(statement)) statement.declarationList.declarations.forEach((decl) => collect(decl.name));
}
function freeProps(node) {
  const props = new Set();
  function walk(child) {
    if (ts.isIdentifier(child)) {
      const symbol = checker.getSymbolAtLocation(child);
      if (localSymbols.has(symbol)) props.add(localSymbols.get(symbol));
    }
    ts.forEachChild(child, walk);
  }
  walk(node);
  return [...props].sort();
}
const stylesStatement = sf.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations.some((decl) => decl.name.getText(sf) === 'styles'));
const modelNodes = sf.statements.filter((node) => !ts.isImportDeclaration(node) && node !== screen && node !== stylesStatement);
const modelNames = modelNodes.flatMap((node) => ts.isVariableStatement(node) ? node.declarationList.declarations.map((decl) => text(decl.name)) : node.name ? [text(node.name)] : []);
const modelImport = `import { ${modelNames.join(', ')} } from '@/features/trip-request/requestFormModel';`;
const commonImports = `${imports}\n${modelImport}\nimport { requestStyles as styles } from '@/features/trip-request/requestStyles';\n`;
const files = {};
files['features/trip-request/requestFormModel.ts'] = imports + '\n\n' + modelNodes.map((node) => 'export ' + text(node)).join('\n\n') + '\n';
files['features/trip-request/requestStyles.ts'] = imports + '\n\n' + text(stylesStatement).replace('const styles =', 'export const requestStyles =') + '\n';
const componentImports = [];
const replacements = [];
const usedControllerProps = new Set();
function component(name, node, replacement = true) {
  const props = freeProps(node);
  props.forEach((name) => usedControllerProps.add(name));
  files[`components/trip-request/${name}.tsx`] = `${commonImports}\nimport type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';\n\ntype Props = Pick<RequestTripController, ${props.map((name) => `'${name}'`).join(' | ') || 'never'}>;\n\nexport function ${name}({ ${props.join(', ')} }: Props) {\n  return (${text(node)});\n}\n`;
  componentImports.push(`import { ${name} } from '@/components/trip-request/${name}';`);
  if (replacement) replacements.push({ start: node.getStart(sf), end: node.end, value: `<${name} ${props.map((prop) => `${prop}={${prop}}`).join(' ')} />` });
}
// The existing JSX and event handlers are moved intact; no layout redesign.
function walk(node) {
  if (ts.isJsxElement(node)) {
    const tag = node.openingElement.tagName.getText(sf);
    const attrs = node.openingElement.attributes.properties.map(text).join(' ');
    if (attrs.includes('styles.routeSetup}')) component('RequestRouteStep', node);
    if (attrs.includes('styles.offerMap}')) component('RequestRoutePreview', node);
    if (attrs.includes('styles.offerTimeCompactBlock}')) component('RequestScheduleFields', node);
    if (tag === 'Modal' && attrs.includes('visible={isRequestSuccessVisible}')) component('RequestSuccessModal', node);
    if (tag === 'Modal' && attrs.includes('iosPickerMode')) component('RequestDatePickerModal', node);
  }
  ts.forEachChild(node, walk);
}
walk(returned);
const manualRender = screen.body.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations[0].name.getText(sf) === 'renderManualGeocodeStatus');
const manualArrow = manualRender.declarationList.declarations[0].initializer;
files['components/trip-request/ManualGeocodeStatus.tsx'] = `${commonImports}\nexport function ManualGeocodeStatus({ status }: { status: ManualGeocodeStatus }) ${text(manualArrow.body)}\n`;
// Replace render helper calls in the route component, retaining its exact display.
files['components/trip-request/RequestRouteStep.tsx'] = files['components/trip-request/RequestRouteStep.tsx']
  .replaceAll('{renderManualGeocodeStatus(departureManualGeocodeStatus)}', '<ManualGeocodeStatus status={departureManualGeocodeStatus} />')
  .replaceAll('{renderManualGeocodeStatus(arrivalManualGeocodeStatus)}', '<ManualGeocodeStatus status={arrivalManualGeocodeStatus} />')
  .replaceAll("'renderManualGeocodeStatus' | ", '').replaceAll(', renderManualGeocodeStatus', '')
  .replaceAll('renderManualGeocodeStatus, ', '') + `\nimport { ManualGeocodeStatus } from './ManualGeocodeStatus';\n`;
usedControllerProps.delete('renderManualGeocodeStatus');
const primaryRender = screen.body.statements.find((node) => ts.isVariableStatement(node) && node.declarationList.declarations[0].name.getText(sf) === 'renderPrimaryButton');
const primaryArrow = primaryRender.declarationList.declarations[0].initializer;
const primaryProps = freeProps(primaryArrow.body).filter((prop) => prop !== 'compact');
primaryProps.forEach((name) => usedControllerProps.add(name));
files['components/trip-request/RequestPrimaryButton.tsx'] = `${commonImports}\nimport type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';\n\ntype Props = Pick<RequestTripController, ${primaryProps.map((name) => `'${name}'`).join(' | ')}> & { compact?: boolean };\nexport function RequestPrimaryButton({ compact = false, ${primaryProps.join(', ')} }: Props) { return ${text(primaryArrow.body)}; }\n`;
componentImports.push(`import { RequestPrimaryButton } from '@/components/trip-request/RequestPrimaryButton';`);
let view = original.slice(returned.getStart(sf), returned.end);
for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
  const start = replacement.start - returned.getStart(sf), end = replacement.end - returned.getStart(sf);
  view = view.slice(0, start) + replacement.value + view.slice(end);
}
view = view.replace(/\r\n/g, '\n').replace('{renderPrimaryButton(false)}', `<RequestPrimaryButton ${primaryProps.map((prop) => `${prop}={${prop}}`).join(' ')} />`);
freeProps(returned).filter((name) => !['renderPrimaryButton', 'renderManualGeocodeStatus'].includes(name)).forEach((name) => usedControllerProps.add(name));
const props = [...usedControllerProps].sort();
const logicStatements = screen.body.statements.filter((node) => node !== returned && node !== manualRender && node !== primaryRender);
files['hooks/trip-request/useRequestTripController.ts'] = `${commonImports}\nexport function useRequestTripController() {\n${logicStatements.map(text).join('\n\n')}\nreturn { ${props.join(', ')} };\n}\n\nexport type RequestTripController = ReturnType<typeof useRequestTripController>;\n`;
files['app/request/index.tsx'] = `${commonImports}\n${componentImports.join('\n')}\nimport { useRequestTripController } from '@/hooks/trip-request/useRequestTripController';\n\nexport default function RequestTripScreen() {\n const { ${props.join(', ')} } = useRequestTripController();\n ${view}\n}\n`;
process.stdout.write(JSON.stringify(files));
