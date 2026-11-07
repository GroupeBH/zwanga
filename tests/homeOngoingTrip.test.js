const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const native = { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button',
  StyleSheet: { create: value => value }, Platform: { OS: 'android' } };
const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  './HomeDriverStatus': { HomeDriverStatus: 'DriverStatus' } });
const { HomeOngoingTripSheet } = load('components/home/HomeOngoingTripSheet.tsx');
const { HomeHeader } = load('components/home/HomeHeader.tsx');
const { styles } = load('features/home/HomeOngoingTripSheet.styles.ts');
const { Spacing } = load('constants/styles.ts');
const trip = { id: 'ride', status: 'ongoing', driverId: 'driver',
  departure: { name: 'Départ du trajet' }, arrival: { name: 'Destination du trajet' } };
const booking = { id: 'booking', tripId: trip.id, passengerId: 'passenger', status: 'accepted',
  passengerOrigin: 'Départ personnel', passengerDestination: 'Arrêt personnel', trip };
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
function textOf(tree) {
  if (typeof tree === 'string') return tree;
  if (Array.isArray(tree)) return tree.map(textOf).join(' ');
  return React.isValidElement(tree) ? textOf(tree.props.children) : '';
}
function render(patch = {}) {
  const routes = [];
  const props = { activeHomeTrip: trip, ongoingDriverTrip: null, ongoingBookingId: booking.id,
    activeBookings: [booking], width: 390, sheetHeight: 288, sheetBottomOffset: 0,
    router: { push: route => routes.push(route) }, onSheetLayout() {}, ...patch };
  const tree = HomeOngoingTripSheet.type(props);
  return { tree, props, routes, text: textOf(tree), buttons: nodes(tree).filter(node => node.type === 'Button') };
}

test('ongoing driver Home has one clear action to the existing navigation, not new-ride actions', () => {
  const h = render({ ongoingDriverTrip: trip, ongoingBookingId: null });
  assert.match(h.text, /Trajet en cours/);
  assert.match(h.text, /Vous conduisez/);
  assert.match(h.text, /Départ Départ du trajet/);
  assert.match(h.text, /Arrivée Destination du trajet/);
  assert.match(h.text, /Destination du trajet/);
  assert.doesNotMatch(h.text, /Départ personnel|Arrêt personnel|Publier|Commander|Annuler|Terminer/);
  assert.equal(h.buttons.length, 1);
  assert.equal(textOf(h.buttons[0]).trim(), 'Revenir au trajet');
  assert.notEqual(h.buttons[0].props.disabled, true);
  h.buttons[0].props.onPress();
  assert.deepEqual(h.routes, ['/trip/navigate/ride']);
});

test('passenger Home uses the booking navigation and personal stop, even for a driver-capable user', () => {
  const h = render({ isDriver: true, ongoingDriverTrip: { ...trip, id: 'another-ride' } });
  assert.match(h.text, /Vous êtes passager/);
  assert.match(h.text, /Votre départ Départ personnel/);
  assert.match(h.text, /Votre arrivée Arrêt personnel/);
  assert.doesNotMatch(h.text, /Vous conduisez|Départ du trajet|Destination du trajet/);
  h.buttons[0].props.onPress();
  assert.deepEqual(h.routes, ['/booking/navigate/booking']);
});

test('a booking from another ride or ID cannot supply the displayed departure or destination', () => {
  for (const patch of [{ id: 'other-booking' }, { tripId: 'other-ride' }]) {
    const h = render({ activeBookings: [{ ...booking, ...patch }] });
    assert.doesNotMatch(h.text, /Départ personnel|Arrêt personnel/);
    assert.match(h.text, /Départ du trajet/);
    assert.match(h.text, /Destination du trajet/);
  }
});

test('missing booking ID has a usable Mes trajets fallback, never a driver or undefined URL', () => {
  const h = render({ ongoingBookingId: null });
  assert.match(h.text, /Retrouver mon trajet/);
  h.buttons[0].props.onPress();
  assert.deepEqual(h.routes, ['/(tabs)/trips']);
});

test('missing places have readable fallbacks; no active ride produces no panel', () => {
  assert.equal(render({ activeHomeTrip: null }).tree, null);
  const h = render({ activeHomeTrip: { ...trip, departure: null, arrival: null }, activeBookings: [] });
  assert.match(h.text, /Votre départ À retrouver dans le trajet/);
  assert.match(h.text, /Votre arrivée À retrouver dans le trajet/);
  assert.doesNotMatch(h.text, /undefined|null/);
  const fallback = render({ activeHomeTrip: { ...trip, departure: { name: ' ', address: 'Adresse de départ' },
    arrival: { name: ' ', address: 'Adresse précise' } },
    activeBookings: [{ ...booking, passengerOrigin: ' ', passengerDestination: ' ' }] });
  assert.match(fallback.text, /Adresse de départ/);
  assert.match(fallback.text, /Adresse précise/);
});

test('long places can scroll while the action stays outside the scroll area and above the tabs', () => {
  const h = render({ sheetBottomOffset: 96, activeBookings: [{ ...booking,
    passengerOrigin: 'Un long départ '.repeat(20), passengerDestination: 'Une longue destination '.repeat(20) }] });
  const scroll = nodes(h.tree).find(node => node.type === 'Scroll');
  assert.equal(nodes(scroll).some(node => node.type === 'Button'), false);
  const destination = nodes(scroll).find(node => node.type === 'Text' && textOf(node).startsWith('Une longue'));
  assert.equal(destination.props.numberOfLines, undefined);
  assert.equal(destination.props.adjustsFontSizeToFit, undefined);
  const departure = nodes(scroll).find(node => node.type === 'Text' && textOf(node).startsWith('Un long'));
  assert.equal(departure.props.numberOfLines, undefined);
  assert.equal(departure.props.allowFontScaling, undefined);
  assert.equal(h.tree.props.onLayout, h.props.onSheetLayout);
  assert.equal(Object.assign({}, ...h.tree.props.style).bottom, 96);
  assert.ok(styles.action.minHeight >= 48);
  assert.equal(styles.action.height, undefined);
  assert.equal(styles.actionText.flexShrink, 1);
  assert.equal(styles.scroll.minHeight, 0);
});

test('the active ride has a high-contrast header, named endpoints and distinct map-style markers', () => {
  const h = render();
  const title = nodes(h.tree).find(node => node.type === 'Text' && textOf(node) === 'Trajet en cours');
  assert.equal(title.props.accessibilityRole, 'header');
  assert.equal(styles.title.color, '#FFFFFF');
  assert.equal(styles.status.backgroundColor, '#1E2A4A');
  assert.equal(nodes(h.tree).some(node => node.type === 'View' && node.props.style === styles.departureMarker), true);
  assert.equal(nodes(h.tree).some(node => node.type === 'Icon' && node.props.name === 'location-sharp'), true);
  assert.notEqual(styles.departureMarker.borderColor, styles.action.backgroundColor);
  assert.ok(h.text.indexOf('Votre départ') < h.text.indexOf('Votre arrivée'));
  assert.doesNotMatch(h.text, /Connecté|En direct|ETA|min restantes/, 'do not invent network status or arrival estimates');
});

test('short landscape scenes place the status and itinerary beside the action instead of stacking them', () => {
  const wide = render({ width: 680, sheetHeight: 138.6 });
  assert.equal(Object.assign({}, ...wide.tree.props.style).flexDirection, 'row');
  const scroll = nodes(wide.tree).find(node => node.type === 'Scroll');
  assert.equal(Object.assign({}, ...scroll.props.contentContainerStyle).flexDirection, 'row');
  assert.equal(styles.horizontalStatusCopy.flexBasis, 'auto', 'the status keeps its real text height when centered');
  assert.match(wide.text, /Trajet en cours/);
  assert.match(wide.text, /Votre départ Départ personnel/);
  assert.match(wide.text, /Votre arrivée Arrêt personnel/);
  assert.equal(wide.buttons.length, 1);
  assert.equal(Object.assign({}, ...render({ width: 320 }).tree.props.style).flexDirection, undefined);
  assert.equal(Object.assign({}, ...render({ width: 680, sheetHeight: 288 }).tree.props.style).flexDirection, undefined);
});

test('the dedicated ride panel suppresses the redundant header shortcut without hiding notifications or profile', () => {
  const routes = [];
  for (const isDriver of [false, true]) {
    const tree = HomeHeader.type({ insets: { top: 24 }, router: { push: route => routes.push(route) },
      isDriver, ongoingDriverTrip: isDriver ? trip : null, ongoingBookedTrip: isDriver ? null : trip,
      ongoingBookingId: booking.id, profileInitial: 'T', unreadNotifications: 2, showOngoingShortcut: false });
    assert.doesNotMatch(textOf(tree), /Trajet en cours/);
    assert.equal(nodes(tree).some(node => node.type === 'DriverStatus'), false);
    const buttons = nodes(tree).filter(node => node.type === 'Button');
    assert.equal(buttons.length, 2);
    buttons.forEach(button => button.props.onPress());
  }
  assert.deepEqual(routes, ['/notifications', '/profile', '/notifications', '/profile']);
});

for (const os of ['android', 'ios']) {
  test(`${os}: ride panel stays bounded through rotation, layout callbacks and return to normal Home`, () => {
    const hooks = hookHarness();
    const { useHomeSheet } = loader({ react: hooks.react, 'react-native': { ...native, Platform: { OS: os } },
      '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => true } })('hooks/home/useHomeSheet.ts');
    const props = { isDriver: true, isScreenActive: true, isHomeSheetLockedRetracted: false,
      currentUser: {}, latestTrips: [], availableDriverRequests: [], width: 390, height: 844,
      insets: { bottom: 34 }, router: { push() {} } };
    const draw = () => hooks.render(() => useHomeSheet(props));
    const normal = draw();
    props.isHomeSheetLockedRetracted = true;
    let result = draw();
    assert.equal(result.sheetHeight, 288);
    assert.ok(result.sheetHeight < normal.sheetHeight);
    result.toggleTripsSheet(); // No fake expandable handle while riding.
    assert.equal(draw().sheetHeight, 288);
    for (const scene of [{ width: 390, height: 748 }, { width: 320, height: 472 }, { width: 844, height: 320 }]) {
      const oldLayout = result.onSheetLayout;
      props.width = scene.width;
      props.height = scene.height + 96;
      draw().onHomeLayout({ nativeEvent: { layout: scene } });
      result = draw();
      oldLayout({ nativeEvent: { layout: { height: 900 } } });
      const available = scene.height - result.sheetBottomOffset;
      assert.equal(result.sheetHeight, Math.min(288, available * 0.55));
      for (let i = 0; i < 50; i++) {
        result.onSheetLayout({ nativeEvent: { layout: { height: result.sheetHeight } } });
        result = draw();
        assert.equal(result.sheetHeight, Math.min(288, available * 0.55));
        assert.equal(result.locationButtonBottom, result.sheetBottomOffset + Math.ceil(result.sheetHeight) + Spacing.md);
      }
      assert.equal(result.mapBottomOffset, result.sheetBottomOffset + result.sheetHeight - 26);
    }
    props.isHomeSheetLockedRetracted = false;
    assert.equal(draw().effectiveTripsSheetOpen, true);
    draw().toggleTripsSheet();
    assert.equal(draw().sheetHeight, 78);
    props.isHomeSheetLockedRetracted = true;
    assert.ok(draw().sheetHeight > 78);
    props.isHomeSheetLockedRetracted = false;
    assert.equal(draw().sheetHeight, 78, 'respect the previous voluntary collapse when the ride ends');
    hooks.unmount();
  });
}
