const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll',
  StyleSheet: { create: value => value }, Platform: { OS: 'ios', select: value => value.ios } };
const parts = ['HomeDriverStatus', 'HomeDriverEarnings', 'HomeDestinationShortcuts', 'HomeSheetLoadingState', 'SwipeableHomePriority'];
const load = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
  ...Object.fromEntries(parts.map(name => [`./${name}`, { [name]: name }])) });
const { HomeHeader } = load('components/home/HomeHeader.tsx');
const { HomeTripsSheet } = load('components/home/HomeTripsSheet.tsx');
const { HomeSuggestionCard } = load('components/home/HomeSuggestionCard.tsx');
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return React.isValidElement(node) ? text(node.props.children) : '';
}
const flatten = style => Object.assign({}, ...(Array.isArray(style) ? style : [style]));
const base = { firstName: 'Alex', effectiveTripsSheetOpen: true, sheetHeight: 470, sheetBottomOffset: 96,
  sheetTitle: 'Trajets', availableDriverRequests: [], latestTrips: [], bookedTripIds: new Set(), hiddenHomePriorities: {},
  recentDestinations: [], router: { push() {} } };
const trip = { id: 'trip', departure: { name: 'Départ' }, arrival: { name: 'Arrivée' }, departureTime: '2026-12-02T12:00:00Z',
  driverName: 'Conducteur test', availableSeats: 2, vehicleType: 'car', price: 0 };

test('map header keeps only initial, notifications and truthful active-trip feedback', () => {
  const calls = [];
  const props = { insets: { top: 20 }, firstName: 'Alex', unreadNotifications: 12, router: { push: path => calls.push(path) } };
  const tree = HomeHeader.type(props);
  assert.equal(text(tree), 'A9+');
  const buttons = nodes(tree).filter(node => node.type === 'Button');
  assert.equal(buttons.length, 2); buttons.forEach(button => button.props.onPress());
  assert.deepEqual(calls, ['/profile', '/notifications']);
  assert.match(text(HomeHeader.type({ ...props, ongoingDriverTrip: {} })), /Trajet en cours/);
  assert.match(text(HomeHeader.type({ ...props, ongoingBookedTrip: {} })), /Trajet en cours/);
  assert.doesNotMatch(text(HomeHeader.type({ ...props, trackedTripInfo: { role: 'driver' } })), /en cours/);
});

test('passenger search, publish and order actions retain their existing destinations', () => {
  const calls = [];
  const tree = HomeTripsSheet.type({ ...base, router: { push: route => calls.push(route) } });
  for (const label of ['Où allez-vous ?', 'Proposer un trajet', 'Commander']) {
    const button = nodes(tree).find(node => node.type === 'Button' && text(node) === label);
    assert.ok(button); assert.equal(button.props.accessibilityRole, 'button');
    assert.ok(flatten(button.props.style).minHeight >= 44);
    for (const labelNode of nodes(button).filter(node => node.type === 'Text')) {
      assert.equal(labelNode.props.numberOfLines, undefined);
      assert.notEqual(labelNode.props.allowFontScaling, false);
      assert.notEqual(labelNode.props.adjustsFontSizeToFit, true);
    }
    button.props.onPress();
  }
  assert.deepEqual(calls, ['/search', '/publish', { pathname: '/request-create' }]);
  assert.ok(nodes(tree).some(node => node.type === 'HomeDestinationShortcuts'));
  assert.doesNotMatch(text(tree), /Demander/);
});

test('driver dashboard keeps publishing, ordering, clients and revenue without public trip discovery', () => {
  const modes = [], calls = [];
  const tree = HomeTripsSheet.type({ ...base, isDriver: true, isRequestsSheetMode: true, isScreenActive: true,
    router: { push: path => calls.push(path) }, setHomeSheetMode: mode => modes.push(mode), openSheetIndex: () => calls.push('all') });
  const elements = nodes(tree);
  for (const label of ['Publier un trajet', 'Commander', 'Chercher un trajet', 'Voir tout']) {
    elements.find(node => node.type === 'Button' && text(node) === label).props.onPress();
  }
  elements.find(node => node.props.accessibilityLabel === '0 clients disponibles').props.onPress();
  assert.equal(elements.some(node => node.type === 'HomeDriverStatus'), false);
  assert.doesNotMatch(text(tree), /Indisponible|Hors ligne|En ligne/);
  elements.find(node => node.type === 'HomeDriverEarnings').props.onPress();
  assert.deepEqual(modes, []);
  assert.deepEqual(calls, ['/publish', { pathname: '/request-create' }, '/search',
    'all', 'all', '/driver-earnings']);
  const searchButton = elements.find(node => node.props.accessibilityLabel === 'Chercher un trajet');
  assert.ok(flatten(searchButton.props.style).minHeight >= 44);
  assert.match(searchButton.props.accessibilityHint, /voyager comme passager/);
  assert.equal(elements.some(node => node.props.accessibilityRole === 'tab'), false);
  assert.equal(elements.some(node => node.type === 'Button' && text(node) === 'Trajets'), false);
  assert.equal(elements.some(node => node.type === 'HomeDestinationShortcuts'), false);
  assert.equal(elements.find(node => node.type === 'HomeDriverEarnings').props.active, true);
});

test('option A uses midnight blue and burnt orange with readable white labels; search remains input-like', () => {
  const { HOME_DASHBOARD_COLORS: c } = load('features/home/homeDashboardTheme.ts');
  assert.equal(c.blue, '#1E2A4A');
  assert.equal(c.orange, '#D1430F');
  const elements = nodes(HomeTripsSheet.type(base));
  const button = label => elements.find(node => node.type === 'Button' && text(node) === label);
  const luminance = hex => {
    const values = hex.slice(1).match(/../g).map(value => parseInt(value, 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
  };
  for (const [label, color, foreground] of [['Proposer un trajet', c.blue, '#FFFFFF'], ['Commander', c.orange, '#FFFFFF']]) {
    const action = button(label);
    assert.equal(flatten(action.props.style).backgroundColor, color);
    assert.equal(flatten(nodes(action).find(node => node.type === 'Text').props.style).color, foreground);
    const levels = [luminance(foreground), luminance(color)].sort((a, b) => b - a);
    assert.ok((levels[0] + 0.05) / (levels[1] + 0.05) >= 4.5, `${label}: normal-size text contrast`);
  }
  assert.equal(flatten(button('Où allez-vous ?').props.style).backgroundColor, '#FFFFFF');
});

test('only one suggestion mounts, with reserved trips retained if no new trip is available', () => {
  const reserved = { ...trip, id: 'reserved' };
  const props = { ...base, latestTrips: [reserved, trip, { ...trip, id: 'later' }], bookedTripIds: new Set(['reserved']) };
  const suggestions = tree => nodes(tree).filter(node => node.type === HomeSuggestionCard);
  let cards = suggestions(HomeTripsSheet.type(props));
  assert.equal(cards.length, 1); assert.equal(cards[0].props.item.id, 'trip');
  cards = suggestions(HomeTripsSheet.type({ ...props, latestTrips: [reserved] }));
  assert.equal(cards[0].props.booked, true); assert.equal(cards[0].props.item.id, 'reserved');
});

test('priorities shown over the map are not repeated inside the discovery sheet', () => {
  const reserved = { ...trip, id: 'reserved' };
  const request = { id: 'nearest' }, otherRequest = { id: 'other-request' };
  const suggestions = props => nodes(HomeTripsSheet.type({ ...base, ...props })).filter(node => node.type === HomeSuggestionCard);
  assert.equal(suggestions({ featuredPassengerTrip: reserved, latestTrips: [reserved], bookedTripIds: new Set(['reserved']) }).length, 0);
  assert.equal(suggestions({ featuredPassengerTrip: reserved, latestTrips: [reserved, trip], bookedTripIds: new Set(['reserved']) })[0].props.item.id, 'trip');
  const driver = { isDriver: true, isRequestsSheetMode: true, highlightedDriverRequest: request };
  assert.equal(suggestions({ ...driver, availableDriverRequests: [request] }).length, 0);
  assert.equal(suggestions({ ...driver, availableDriverRequests: [request, otherRequest] })[0].props.item.id, 'other-request');
  assert.match(text(HomeTripsSheet.type({ ...base, ...driver, availableDriverRequests: [request] })), /sur la carte/);
});

test('passengers never get clients and dismissed requests do not reappear through the fallback', () => {
  const request = { id: 'request', departureDateMin: '2026-12-02', updatedAt: '2026-12-01' };
  const { homePriorityKeys } = load('features/home/homePriorityDismissal.ts');
  const props = { ...base, isRequestsSheetMode: true, availableDriverRequests: [request],
    hiddenHomePriorities: { [homePriorityKeys.nearbyRequest(request)]: true } };
  assert.equal(nodes(HomeTripsSheet.type(props)).some(node => node.type === HomeSuggestionCard), false);
  assert.equal(nodes(HomeTripsSheet.type({ ...props, isDriver: true })).some(node => node.type === HomeSuggestionCard), false);
});

test('no clients never falls back to public trip cards on driver Home', () => {
  for (const state of [{}, { sheetLoading: true }, { sheetError: true }]) {
    const tree = HomeTripsSheet.type({ ...base, ...state, isDriver: true, isRequestsSheetMode: false,
      latestTrips: [trip], availableDriverRequests: [] });
    assert.equal(nodes(tree).some(node => node.type === HomeSuggestionCard), false);
    assert.equal(nodes(tree).some(node => node.props.accessibilityRole === 'tab'), false);
    assert.ok(nodes(tree).some(node => node.props.accessibilityLabel === 'Voir tous les clients'));
    if (!state.sheetLoading && !state.sheetError) assert.match(text(tree), /Aucun nouveau client/);
  }
});

test('wider departures have an honest scope hint only in the expanded passenger trip feed', () => {
  const props = { ...base, latestTrips: [trip], suggestionScopeLabel: 'Autres départs · moins de 10 km, sous 48 h' };
  assert.match(text(HomeTripsSheet.type(props)), /10 km.*48 h/);
  assert.doesNotMatch(text(HomeTripsSheet.type({ ...props, isDriver: true, isRequestsSheetMode: true })), /10 km/);
  assert.doesNotMatch(text(HomeTripsSheet.type({ ...props, effectiveTripsSheetOpen: false })), /10 km/);
});

test('cached suggestions remain visible during loading and errors without a blocking state', () => {
  for (const state of [{ sheetLoading: true }, { sheetError: true }]) {
    const tree = HomeTripsSheet.type({ ...base, ...state, latestTrips: [trip] });
    assert.ok(nodes(tree).some(node => node.type === HomeSuggestionCard));
    assert.equal(nodes(tree).some(node => node.type === 'HomeSheetLoadingState'), false);
    assert.doesNotMatch(text(tree), /Chargement impossible/);
  }
});

test('loading or failed discovery never hides personal reservations supplied separately', () => {
  const hooks = hookHarness();
  const { useHomeSheet } = loader({ react: hooks.react, 'react-native': native })('hooks/home/useHomeSheet.ts');
  const props = { isDriver: false, width: 390, height: 844, insets: { bottom: 34 },
    latestTrips: [trip], availableDriverRequests: [], tripsLoading: true, tripsError: false };
  const draw = () => hooks.render(() => useHomeSheet(props));
  assert.equal(draw().sheetLoading, false);
  props.tripsLoading = false; props.tripsError = true; assert.equal(draw().sheetError, false);
  props.latestTrips = []; assert.equal(draw().sheetError, true);
  hooks.unmount();
});

test('dashboard starts open, preserves voluntary collapse and restores the choice after a ride', () => {
  for (const isDriver of [true, false]) {
    const hooks = hookHarness();
    const { useHomeSheet } = loader({ react: hooks.react, 'react-native': native })('hooks/home/useHomeSheet.ts');
    const props = { isDriver, width: 390, height: 844, insets: { bottom: 34 }, currentUser: {},
      latestTrips: [], availableDriverRequests: [], isScreenActive: true, isHomeSheetLockedRetracted: false };
    const draw = () => hooks.render(() => useHomeSheet(props));
    assert.equal(draw().effectiveTripsSheetOpen, true); assert.equal(draw().isRequestsSheetMode, isDriver);
    props.isHomeSheetLockedRetracted = true; assert.equal(draw().effectiveTripsSheetOpen, false);
    draw().toggleTripsSheet(); props.isHomeSheetLockedRetracted = false;
    assert.equal(draw().effectiveTripsSheetOpen, true);
    draw().toggleTripsSheet(); assert.equal(draw().effectiveTripsSheetOpen, false);
    props.isScreenActive = false; draw(); props.isScreenActive = true;
    assert.equal(draw().effectiveTripsSheetOpen, false);
    props.isHomeSheetLockedRetracted = true; draw(); props.isHomeSheetLockedRetracted = false;
    assert.equal(draw().effectiveTripsSheetOpen, false); hooks.unmount();
  }
});

test('bounded dashboard scrolls vertically and collapse unmounts its content', () => {
  const onLayout = () => {};
  const tree = HomeTripsSheet.type({ ...base, onSheetLayout: onLayout });
  assert.equal(flatten(tree.props.style).height, 470); assert.equal(flatten(tree.props.style).bottom, 96);
  assert.equal(tree.props.onLayout, onLayout);
  assert.equal(nodes(tree).filter(node => node.type === 'Scroll').length, 1);
  const closed = HomeTripsSheet.type({ ...base, effectiveTripsSheetOpen: false, sheetHeight: 78 });
  assert.equal(flatten(closed.props.style).height, 78);
  assert.equal(nodes(closed).some(node => node.type === 'Scroll'), false);
  assert.equal(nodes(closed).some(node => node.props.testID === 'home-discovery-actions'), false);
});

test('discovery follows the role even with an obsolete feed mode, without tabs or a fixed footer', () => {
  for (const isDriver of [true, false]) {
    for (const isRequestsSheetMode of [true, false]) {
      for (const state of [{}, { sheetLoading: true }, { sheetError: true }]) {
        const calls = [], modes = [];
        const tree = HomeTripsSheet.type({ ...base, ...state, isDriver, isRequestsSheetMode,
          latestTrips: Array.from({ length: 10 }, (_, i) => ({ ...trip, id: `trip-${i}` })),
          availableDriverRequests: Array.from({ length: 10 }, (_, i) => ({ id: `request-${i}` })),
          setHomeSheetMode: mode => modes.push(mode), openSheetIndex: () => calls.push('all'),
        });
        const elements = nodes(tree);
        const controls = elements.find(node => node.props.testID === 'home-discovery-actions');
        const scroll = elements.find(node => node.type === 'Scroll');
        assert.ok(controls);
        assert.equal(nodes(scroll).includes(controls), true, 'controls belong to the scrolling header, not a fixed footer');
        assert.equal(flatten(controls.props.style).position, undefined);
        assert.equal(elements.filter(node => node.props.testID === 'home-discovery-actions').length, 1);
        const cards = elements.filter(node => node.type === HomeSuggestionCard);
        assert.ok(cards.every(card => elements.indexOf(controls) < elements.indexOf(card)), 'longer lists cannot push controls below the suggestions');
        assert.equal(flatten(tree.props.style).height, base.sheetHeight, 'map space is preserved');
        const buttons = nodes(controls).filter(node => node.type === 'Button');
        assert.equal(buttons.length, 1);
        assert.equal(cards.length, 1);
        assert.equal(cards[0].props.kind, isDriver ? 'request' : 'trip');
        for (const button of buttons) {
          assert.ok(flatten(button.props.style).minHeight >= 44);
          button.props.onPress();
          for (const label of nodes(button).filter(node => node.type === 'Text')) {
            assert.equal(label.props.numberOfLines, undefined);
            assert.notEqual(label.props.allowFontScaling, false);
          }
        }
        assert.deepEqual(calls, ['all']);
        assert.deepEqual(modes, []);
        assert.equal(text(buttons.at(-1)), 'Voir tout');
        assert.equal(buttons.at(-1).props.accessibilityLabel, isDriver ? 'Voir tous les clients' : 'Voir tous les trajets');
        const tabs = buttons.filter(button => button.props.accessibilityRole === 'tab');
        assert.equal(tabs.length, 0);
      }
    }
  }
});

test('driver can still order without changing role; both primary actions share one row', () => {
  for (const isRequestsSheetMode of [true, false]) {
    const calls = [];
    const tree = HomeTripsSheet.type({ ...base, isDriver: true, isRequestsSheetMode,
      router: { push: route => calls.push(route) } });
    const elements = nodes(tree);
    const order = elements.find(node => node.props.accessibilityLabel === 'Commander un véhicule');
    const publish = elements.find(node => node.type === 'Button' && text(node) === 'Publier un trajet');
    const row = elements.find(node => node.type === 'View' && Array.isArray(node.props.children)
      && node.props.children.includes(order) && node.props.children.includes(publish));
    assert.ok(row);
    assert.equal(flatten(row.props.style).flexDirection, 'row');
    assert.equal(order.props.accessibilityRole, 'button');
    for (const button of [order, publish]) {
      assert.ok(flatten(button.props.style).minHeight >= 44);
      for (const label of nodes(button).filter(node => node.type === 'Text')) {
        assert.equal(label.props.numberOfLines, undefined);
        assert.notEqual(label.props.allowFontScaling, false);
      }
    }
    order.props.onPress();
    assert.deepEqual(calls, [{ pathname: '/request-create' }]);
  }
});

test('empty, loading and failed feeds retain inline discovery controls ahead of their state message', () => {
  for (const isDriver of [true, false]) {
    for (const state of [{}, { sheetLoading: true }, { sheetError: true }]) {
      const tree = HomeTripsSheet.type({ ...base, ...state, isDriver, isRequestsSheetMode: true });
      const scroll = nodes(tree).find(node => node.type === 'Scroll');
      const children = scroll.props.children.flat().filter(React.isValidElement);
      const controls = children.find(node => node.props.testID === 'home-discovery-actions');
      const stateNode = children.find(node => node.type === 'HomeSheetLoadingState'
        || /Aucun nouveau client|Aucun trajet disponible|Chargement impossible/.test(text(node)));
      assert.ok(controls); assert.ok(stateNode);
      assert.ok(children.indexOf(controls) < children.indexOf(stateNode));
    }
  }
});

test('native measurements position the control without layout loops and reject invalid sizes', () => {
  for (const platform of ['ios', 'android']) {
    const hooks = hookHarness(); let changedMeasurements = 0;
    const react = { ...hooks.react, useState: initial => {
      const [value, set] = hooks.react.useState(initial);
      return [value, next => set(previous => {
        const updated = typeof next === 'function' ? next(previous) : next;
        if (updated?.height && updated !== previous) changedMeasurements++;
        return updated;
      })];
    } };
    const { useHomeSheet } = loader({ react, 'react-native': { ...native, Platform: { OS: platform } } })('hooks/home/useHomeSheet.ts');
    const { Spacing } = load('constants/styles.ts');
    const props = { isDriver: true, width: 390, height: 844, insets: { bottom: 34 }, latestTrips: [], availableDriverRequests: [] };
    const draw = () => hooks.render(() => useHomeSheet(props));
    const open = draw(), event = height => ({ nativeEvent: { layout: { height } } });
    open.onSheetLayout(event(470.2)); let state = draw();
    assert.equal(state.locationButtonBottom, state.sheetBottomOffset + 471 + Spacing.md);
    assert.equal(state.sheetHeight, open.sheetHeight); assert.equal(state.onSheetLayout, open.onSheetLayout);
    for (let i = 0; i < 100; i++) { state.onSheetLayout(event(470.2)); state = draw(); }
    assert.equal(changedMeasurements, 1);
    for (const invalid of [0, -1, NaN, Infinity]) state.onSheetLayout(event(invalid));
    assert.equal(draw().locationButtonBottom, state.locationButtonBottom);
    draw().toggleTripsSheet(); state = draw();
    assert.equal(state.locationButtonBottom, state.sheetBottomOffset + 78 + Spacing.md);
    props.width = 320; assert.equal(draw().sheetHeight, 78); hooks.unmount();
  }
});

test('Home forwards foreground state to the loader without changing dashboard height', () => {
  for (const active of [true, false]) {
    const tree = HomeTripsSheet.type({ ...base, sheetLoading: true, isScreenActive: active });
    assert.equal(nodes(tree).find(node => node.type === 'HomeSheetLoadingState').props.active, active);
    assert.equal(flatten(tree.props.style).height, base.sheetHeight);
  }
});

test('suggestion price distinguishes free from unknown and its action opens details, never accepts a ride', () => {
  const opened = [], props = { kind: 'trip', item: trip, onOpen: id => opened.push(id) };
  const tree = HomeSuggestionCard.type(props); assert.match(text(tree), /Gratuit.*Réserver/);
  tree.props.onPress(); assert.deepEqual(opened, ['trip']);
  assert.match(text(HomeSuggestionCard.type({ ...props, item: { ...trip, price: undefined } })), /À préciser/);
  assert.match(text(HomeSuggestionCard.type({ ...props, booked: true })), /Voir$/);
  assert.match(tree.props.accessibilityHint, /confirmer votre choix/);
  assert.equal(nodes(tree).some(node => node.type === 'Image'), false);
  const { HOME_DASHBOARD_COLORS: c } = load('features/home/homeDashboardTheme.ts');
  const reserveAction = nodes(tree).find(node => node.type === 'View' && text(node) === 'Réserver');
  assert.equal(flatten(reserveAction.props.style).backgroundColor, c.orange);
  assert.equal(flatten(nodes(reserveAction).find(node => node.type === 'Text').props.style).color, '#FFFFFF');
  const freeBadge = nodes(tree).find(node => node.type === 'View' && text(node) === 'Gratuit');
  assert.equal(flatten(freeBadge.props.style).backgroundColor, c.paleGreen);
});

test('driver publish action uses orange without changing its destination', () => {
  const { HOME_DASHBOARD_COLORS: c } = load('features/home/homeDashboardTheme.ts');
  const calls = [];
  const tree = HomeTripsSheet.type({ ...base, isDriver: true, router: { push: path => calls.push(path) } });
  const button = nodes(tree).find(node => node.type === 'Button' && text(node) === 'Publier un trajet');
  assert.equal(flatten(button.props.style).backgroundColor, c.orange);
  assert.equal(flatten(nodes(button).find(node => node.type === 'Text').props.style).color, '#FFFFFF');
  button.props.onPress(); assert.deepEqual(calls, ['/publish']);
});

test('client acceptance shares the primary orange; green remains a status color', () => {
  const { HOME_DASHBOARD_COLORS: c } = load('features/home/homeDashboardTheme.ts');
  const tree = HomeSuggestionCard.type({ kind: 'request', item: {
    id: 'request', passengerName: 'Client test', departure: trip.departure, arrival: trip.arrival,
    departureDateMin: trip.departureTime, departureDateMax: trip.departureTime, numberOfSeats: 1,
  }, onOpen() {} });
  const action = nodes(tree).find(node => node.type === 'View' && text(node) === 'Accepter');
  assert.equal(flatten(action.props.style).backgroundColor, c.orange);
  assert.equal(flatten(nodes(action).find(node => node.type === 'Text').props.style).color, '#FFFFFF');
  const { styles } = load('features/home/HomeTripsSheet.styles.ts');
  assert.equal(styles.availabilityDotOnline.backgroundColor, c.green);
  assert.equal(styles.availabilityOnline.backgroundColor, c.paleGreen);
});
