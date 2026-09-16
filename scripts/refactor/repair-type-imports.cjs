// Add explicit type-only imports for known domain contracts used by extracted modules.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const ts = require('typescript');
const registry = {
  ManualGeocodeStatus: '@/utils/manualAddressGeocode',
  MapLocationSelection: '@/components/LocationPickerModal',
  RoutePointStatus: '@/features/publish/publishModel',
  LatLng: '@/features/publish/publishModel',
  DateTimePickerEvent: '@react-native-community/datetimepicker',
  BookingPaymentResponse: '@/types', DriverTripInterruptionRequest: '@/types',
  TripRequestVehicleType: '@/types', WalletSummary: '@/types',
  RecurringTripTemplate: '@/types', FavoriteLocation: '@/types',
  NavigationCoordinate: '@/utils/navigation/routeProgress',
  TrackedLocation: '@/store/slices/locationSlice',
  DialogOptions: '@/features/dialogs/dialogTypes',
  LocationObject: 'expo-location', AddressSectionStep: '@/components/AddressSectionSlider',
};
const files = [...new Set(execFileSync('git', ['ls-files', '--modified', '--others', '--exclude-standard'], { encoding: 'utf8' }).trim().split('\n'))]
  .filter(file => /^(app|components|features|hooks|types|utils|store|services)\//.test(file) && /\.tsx?$/.test(file));
for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, original, ts.ScriptTarget.Latest, true);
  const declared = new Set(), referenced = new Set();
  function visit(node) {
    if ((ts.isImportSpecifier(node) || ts.isImportClause(node) || ts.isNamespaceImport(node) ||
      ts.isTypeAliasDeclaration(node) || ts.isInterfaceDeclaration(node) || ts.isTypeParameterDeclaration(node)) && node.name) declared.add(node.name.text);
    if (ts.isTypeReferenceNode(node) && ts.isIdentifier(node.typeName)) referenced.add(node.typeName.text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  const imports = Object.entries(registry).filter(([name]) => referenced.has(name) && !declared.has(name))
    .map(([name, module]) => `import type { ${name} } from '${module}';`);
  if (imports.length) fs.writeFileSync(file, imports.join('\n') + '\n' + original);
}
