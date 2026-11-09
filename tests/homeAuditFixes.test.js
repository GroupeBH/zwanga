const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll',
  ActivityIndicator: 'Spinner', StyleSheet: { create: value => value }, Platform: { OS: 'ios' } };
const parts = ['HomeDriverStatus', 'HomeDriverEarnings', 'HomeDestinationShortcuts', 'HomeSheetLoadingState', 'SwipeableHomePriority'];
const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  ...Object.fromEntries(parts.map(name => [`./${name}`, { [name]: name }])) });
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
function text(tree) {
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  if (Array.isArray(tree)) return tree.map(text).join('');
  return React.isValidElement(tree) ? text(tree.props.children) : '';
}

for (const isDriver of [true, false]) test(`Home offline is not an empty result; reconnect restores the feed (driver=${isDriver})`, () => {
  let online = false;
  const hooks = hookHarness();
  const { useHomeSheet } = loader({ react: hooks.react, 'react-native': native,
    '@/store/hooks': { useAppSelector: select => select({ zwangaApi: { config: { online } } }) },
  })('hooks/home/useHomeSheet.ts');
  const { HomeTripsSheet } = load('components/home/HomeTripsSheet.tsx');
  const props = { isDriver, width: 390, height: 844, insets: { bottom: 34 }, latestTrips: [],
    availableDriverRequests: [], bookedTripIds: new Set(), recentDestinations: [], hiddenHomePriorities: {}, router: { push() {} } };
  const render = () => HomeTripsSheet.type({ ...props, ...hooks.render(() => useHomeSheet(props)) });
  const offline = render();
  assert.match(text(offline), /Connectez-vous à Internet/);
  assert.doesNotMatch(text(offline), /Aucun nouveau client|Aucun trajet disponible|Réessayer/);
  if (isDriver) assert.ok(nodes(offline).some(n => n.props.accessibilityLabel === 'Voir les clients, nombre indisponible'));
  online = true;
  assert.match(text(render()), isDriver ? /Aucun nouveau client/ : /Aucun trajet disponible/);
  hooks.unmount();
});

test('offline Home keeps cached suggestions without an obstructing message', () => {
  const { HomeTripsSheet } = load('components/home/HomeTripsSheet.tsx');
  const tree = HomeTripsSheet.type({ effectiveTripsSheetOpen: true, sheetOffline: true, isDriver: true,
    availableDriverRequests: [{ id: 'known', updatedAt: '2026-11-01' }], latestTrips: [], bookedTripIds: new Set(),
    hiddenHomePriorities: {}, recentDestinations: [], router: { push() {} } });
  assert.doesNotMatch(text(tree), /Connectez-vous|Aucun nouveau client/);
  assert.ok(nodes(tree).some(n => n.props.item?.id === 'known'));
});

test('editing keeps the local catalogue visible without tariffs and can remove an incompatible selected type', () => {
  const { RequestEditVehicleOptions } = load('features/request-detail/RequestEditVehicleOptions.tsx');
  const chosen = [];
  const props = { editVehicleTypes: ['car', 'motorcycle_2_wheels'], parsedEditNumberOfSeats: 3,
    editVehicleOptions: [], isEditVehicleOptionsError: true, editVehiclePriceMultiplier: 1,
    handleSelectEditVehicle: option => chosen.push(option), retryEditVehicleOptions() {} };
  for (const isEditVehicleOptionsLoading of [false, true]) {
    const tree = RequestEditVehicleOptions({ ...props, isEditVehicleOptionsLoading });
    const choices = nodes(tree).filter(n => n.props.accessibilityRole === 'checkbox');
    assert.equal(choices.length, 3);
    assert.deepEqual(choices.map(n => n.props.accessibilityState.checked), [true, true, false]);
    assert.equal(choices[1].props.disabled, false, 'removing the incompatible choice stays possible');
    choices[1].props.onPress();
    assert.deepEqual(chosen.at(-1), { vehicleType: 'motorcycle_2_wheels', availableForRequestedSeats: false });
    assert.doesNotMatch(text(tree), /0 FC|undefined|NaN/);
  }
  const choices = nodes(RequestEditVehicleOptions({ ...props, editVehicleTypes: ['car'] }))
    .filter(n => n.props.accessibilityRole === 'checkbox');
  assert.equal(choices[1].props.disabled, true);
  assert.equal(choices[2].props.disabled, false);
});

test('tariffs returned by the server retain their prices and availability', () => {
  const { RequestEditVehicleOptions } = load('features/request-detail/RequestEditVehicleOptions.tsx');
  const tree = RequestEditVehicleOptions({ editVehicleTypes: ['car'], parsedEditNumberOfSeats: 1,
    editVehicleOptions: [{ vehicleType: 'car', availableForRequestedSeats: true, recommendedPricePerSeat: 1500,
      recommendedTotalPrice: 1500, pricePerKmPerPassenger: 500 }], editVehiclePriceMultiplier: 1 });
  assert.match(text(tree), /1.500 FC/);
  assert.match(text(tree), /trajet estimé/);
  assert.doesNotMatch(text(tree), /500 FC \/ km|par place/);
});

test('request and payment primary actions keep at least 4.5:1 contrast with white text', () => {
  const styles = load('features/trip-request/requestStyles.ts').requestStyles;
  const payment = load('features/screen-styles/components/PassengerArrivalPaymentCoordinator/index.ts').styles;
  const captured = [];
  loader({ 'react-native': { ...native, StyleSheet: { create: s => { captured.push(s); return s; } } },
    './paymentModel': { formatMoney: value => `${value} FC` },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/store/api/driverFinanceApi': { useBookingPaymentOptionsQuery: () => ({}) },
  })('features/arrival-payment/ArrivalPaymentRecovery.tsx');
  const { PendingPaymentReminder } = load('features/arrival-payment/PendingPaymentReminder.tsx');
  const banner = PendingPaymentReminder({ visible: true }).props.style[0];
  const luminance = hex => hex.match(/[a-f\d]{2}/gi).map(c => parseInt(c, 16) / 255)
    .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
  for (const style of [styles.offerSubmitButton, styles.mainButton, styles.requestSuccessPrimary,
    styles.offerPresetActive, styles.flexChipActive, styles.requestStepNumberActive,
    payment.payButton, captured.find(s => s.primary)?.primary, banner]) {
    assert.ok(style);
    assert.ok(1.05 / (luminance(style.backgroundColor) + .05) >= 4.5, style.backgroundColor);
  }
});
