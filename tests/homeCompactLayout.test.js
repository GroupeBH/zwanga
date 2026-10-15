const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', Image: 'Image', FlatList: 'List',
  StyleSheet: { create: value => value }, Platform: { OS: 'ios', select: value => value.ios } };
const load = loader({ react: { ...React, useMemo: factory => factory() }, 'react-native': native,
  '@expo/vector-icons': { Ionicons: 'Icon' }, './HomeFavoriteShortcuts': { HomeFavoriteShortcuts: 'Favorites' },
  './HomeSheetLoadingState': { HomeSheetLoadingState: 'Loading' } });
const { HomeHeader } = load('components/home/HomeHeader.tsx');
const { HomeDashboardActions } = load('components/home/HomeDashboardActions.tsx');
const { HomeTripsSheet } = load('components/home/HomeTripsSheet.tsx');
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return React.isValidElement(node) ? [node, ...nodes(node.props.children),
    ...nodes(node.props.ListHeaderComponent), ...(node.props.data?.length ? [] : nodes(node.props.ListEmptyComponent))] : [];
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return React.isValidElement(node) ? text(node.props.children) + text(node.props.ListHeaderComponent)
    + (node.props.data?.length ? '' : text(node.props.ListEmptyComponent)) : '';
}
const actions = extra => ({ firstName: 'Alex', isOnline: true, router: { push() {} }, availableDriverRequests: [], ...extra });
const sheet = extra => ({ isDriver: true, isRequestsSheetMode: true, availableDriverRequests: [{ id: 'r' }],
  latestTrips: [{ id: 't' }], bookedTripIds: new Set(), header: React.createElement('Header'), ...extra });

test('floating map header has only profile and notifications, with accessible unread count', () => {
  const calls = [];
  const tree = HomeHeader.type({ insets: { top: 20 }, firstName: 'Alex', unreadNotifications: 12,
    router: { push: path => calls.push(path) } });
  const buttons = nodes(tree).filter(n => n.type === 'Button');
  assert.equal(buttons.length, 2);
  buttons.forEach(n => n.props.onPress());
  assert.deepEqual(calls, ['/profile', '/notifications']);
  assert.match(buttons[1].props.accessibilityLabel, /12 non lues/);
  assert.match(text(tree), /9\+/);
  assert.doesNotMatch(text(tree), /Bonjour|Publier|Commander/);
});

test('passenger actions keep search, publishing, ordering and saved addresses reachable', () => {
  const calls = [];
  const tree = HomeDashboardActions.type(actions({ isDriver: false, router: { push: route => calls.push(route) } }));
  const buttons = nodes(tree).filter(n => n.type === 'Button');
  assert.deepEqual(buttons.map(text), ['Où allez-vous ?', 'Proposer un trajet', 'Commander']);
  buttons.forEach(n => { assert.equal(n.props.accessibilityRole, 'button'); n.props.onPress(); });
  assert.deepEqual(calls, ['/search', '/publish', { pathname: '/request-create' }]);
  assert.ok(nodes(tree).some(n => n.type === 'Favorites'));
  assert.doesNotMatch(text(tree), /Clients|demandes|disponible/);
});

test('driver actions prioritize publication and clients, keep earnings and personal ordering', () => {
  const calls = [];
  const tree = HomeDashboardActions.type(actions({ isDriver: true, availableDriverRequests: [{ id: 'r' }],
    router: { push: route => calls.push(route) } }));
  const buttons = nodes(tree).filter(n => n.type === 'Button');
  buttons.forEach(n => n.props.onPress());
  assert.deepEqual(calls, ['/publish', '/requests', '/driver-earnings', { pathname: '/request-create' }]);
  assert.match(text(tree), /Clients à découvrir1/);
  assert.doesNotMatch(text(tree), /Gains du jour|12.?000|En ligne/);
  assert.equal(nodes(tree).some(n => n.type === 'Favorites'), false);
});

test('action colors distinguish publishing, searching and ordering without changing their routes', () => {
  const { homePalette: p } = load('features/home/HomeDashboard.styles.ts');
  const flatten = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
  const passenger = nodes(HomeDashboardActions.type(actions({ isDriver: false }))).filter(n => n.type === 'Button');
  assert.deepEqual(passenger.map(n => flatten(n.props.style).backgroundColor), ['#FFFFFF', p.blue, p.accent]);
  const driver = nodes(HomeDashboardActions.type(actions({ isDriver: true }))).filter(n => n.type === 'Button');
  assert.equal(flatten(driver[0].props.style).backgroundColor, p.blue);
  assert.equal(flatten(driver[1].props.style).backgroundColor, p.greenSoft);
  const cardStyles = load('features/home/HomeSuggestionCard.styles.ts').styles;
  assert.equal(cardStyles.clientAction.backgroundColor, p.green);
  assert.equal(cardStyles.action.backgroundColor, p.accent);
  for (const button of [...passenger.slice(1), driver[0]]) {
    assert.ok(nodes(button).filter(n => n.type === 'Text').every(n => flatten(n.props.style).color === '#FFFFFF'));
    assert.ok(nodes(button).filter(n => n.type === 'Icon').every(n => n.props.color === '#FFFFFF'));
  }
});

test('passenger search looks like an input while preserving a single accessible search entry', () => {
  const { styles, homePalette: p } = load('features/home/HomeDashboard.styles.ts');
  const calls = [];
  const tree = HomeDashboardActions.type(actions({ isDriver: false, router: { push: route => calls.push(route) } }));
  const search = nodes(tree).find(n => n.type === 'Button' && text(n) === 'Où allez-vous ?');
  assert.equal(search.props.style, styles.search, 'search does not inherit the colored primary button style');
  assert.equal(styles.search.backgroundColor, '#FFFFFF');
  assert.equal(styles.search.borderWidth, 1);
  assert.equal(styles.searchText.color, p.muted);
  assert.equal(styles.searchText.fontWeight, '400');
  assert.equal(nodes(search).find(n => n.type === 'Icon').props.color, p.green);
  assert.equal(search.props.accessibilityRole, 'button', 'entry opens another screen, not an editable field');
  assert.match(search.props.accessibilityHint, /saisir votre destination/);
  search.props.onPress();
  assert.deepEqual(calls, ['/search']);
});

test('all three action colors meet 4.5:1 text contrast on their actual surfaces', () => {
  const { homePalette: p } = load('features/home/HomeDashboard.styles.ts');
  const luminance = hex => {
    const channels = hex.match(/[0-9a-f]{2}/gi).map(c => parseInt(c, 16) / 255)
      .map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  for (const [foreground, background] of [[p.blue, '#FFFFFF'], [p.green, '#FFFFFF'],
    [p.accent, '#FFFFFF'], [p.green, p.greenSoft], [p.accent, p.canvas], [p.muted, '#FFFFFF']]) {
    const a = luminance(foreground), b = luminance(background);
    assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, `${foreground} on ${background}`);
  }
});

test('client counters do not pretend to be zero on an unavailable read', () => {
  assert.match(text(HomeDashboardActions.type(actions({ isDriver: true, availableTripRequestsLoading: true }))), /découvrir…/);
  assert.match(text(HomeDashboardActions.type(actions({ isDriver: true, availableTripRequestsError: true }))), /découvrir—/);
  assert.match(text(HomeDashboardActions.type(actions({ isDriver: true, isOnline: false }))), /Hors ligne/);
  assert.match(text(HomeDashboardActions.type(actions({ isDriver: true }))), /découvrir0/);
});

test('driver switches Clients/Trajets while passengers never see client data, even with stale driver state', () => {
  const calls = [], props = sheet({ setHomeSheetMode: mode => calls.push(mode), openSheetIndex: () => calls.push('all') });
  const tree = HomeTripsSheet.type(props), rendered = nodes(tree);
  const tabs = rendered.filter(n => n.props.accessibilityRole === 'tab');
  assert.deepEqual(tabs.map(text), ['Clients', 'Trajets']);
  assert.deepEqual(tabs.map(n => n.props.accessibilityState.selected), [true, false]);
  tabs[1].props.onPress(); tabs[0].props.onPress();
  rendered.find(n => n.props.accessibilityLabel === 'Voir tous les clients').props.onPress();
  assert.deepEqual(calls, ['trips', 'requests', 'all']);
  assert.equal(rendered.find(n => n.type === 'List').props.data[0].kind, 'request');
  const switched = nodes(HomeTripsSheet.type({ ...props, isRequestsSheetMode: false }));
  assert.equal(switched.find(n => n.type === 'List').props.data[0].kind, 'trip');
  const passenger = nodes(HomeTripsSheet.type({ ...props, isDriver: false }));
  assert.equal(passenger.some(n => n.props.accessibilityRole === 'tab'), false);
  assert.equal(passenger.find(n => n.type === 'List').props.data[0].kind, 'trip');
});

test('one vertical virtualized list contains the actions, with no collapse or layout feedback loop', () => {
  for (const isDriver of [true, false]) {
    const tree = HomeTripsSheet.type(sheet({ isDriver, sheetBottomOffset: 96, isHomeSheetLockedRetracted: true }));
    const lists = nodes(tree).filter(n => n.type === 'List');
    assert.equal(lists.length, 1);
    assert.notEqual(lists[0].props.horizontal, true);
    assert.equal(lists[0].props.initialNumToRender, 2);
    assert.equal(lists[0].props.maxToRenderPerBatch, 3);
    assert.equal(lists[0].props.windowSize, 5);
    assert.equal(lists[0].props.removeClippedSubviews, false);
    assert.ok(nodes(lists[0].props.ListHeaderComponent).some(n => n.type === 'Header'));
    assert.equal(tree.props.onLayout, undefined);
    assert.equal(Object.assign({}, ...tree.props.style).marginBottom, 96);
    assert.equal(Object.assign({}, ...tree.props.style).height, undefined);
  }
});

test('wider suggestions keep their honest scope label; an empty client feed does not substitute trips', () => {
  const props = sheet({ suggestionScopeLabel: 'Autres départs · moins de 10 km, sous 48 h' });
  assert.match(text(HomeTripsSheet.type({ ...props, isRequestsSheetMode: false })), /10 km.*48 h/);
  assert.doesNotMatch(text(HomeTripsSheet.type(props)), /10 km/);
  const empty = HomeTripsSheet.type({ ...props, availableDriverRequests: [], sheetEmpty: true });
  assert.match(text(empty), /Pas de client/);
  assert.deepEqual(nodes(empty).find(n => n.type === 'List').props.data, []);
});

test('loading, retry and offline messages keep the actions available without hiding cached data', () => {
  for (const active of [false, true]) {
    const tree = HomeTripsSheet.type(sheet({ availableDriverRequests: [], isScreenActive: active, sheetLoading: true }));
    assert.equal(nodes(tree).find(n => n.type === 'Loading').props.active, active);
    assert.ok(nodes(tree).some(n => n.type === 'Header'));
  }
  let retries = 0;
  const failed = HomeTripsSheet.type(sheet({ availableDriverRequests: [], sheetError: true, refetchSheetContent: () => retries++ }));
  nodes(failed).find(n => n.type === 'Button' && text(n) === 'Réessayer').props.onPress();
  assert.equal(retries, 1);
  const cached = HomeTripsSheet.type(sheet({ sheetOffline: true, sheetError: true }));
  assert.match(text(cached), /Derniers résultats enregistrés/);
  assert.equal(nodes(cached).find(n => n.type === 'List').props.data.length, 1);
  const offline = HomeTripsSheet.type(sheet({ availableDriverRequests: [], sheetOffline: true, sheetEmpty: true }));
  assert.match(text(offline), /Hors ligne/); assert.doesNotMatch(text(offline), /Pas de client/);
});

test('actions wrap with large text and preserve minimum 44-point targets', () => {
  const { styles } = load('features/home/HomeDashboard.styles.ts');
  const list = load('features/home/HomeTripsSheet.styles.ts').styles;
  assert.equal(styles.pair.flexWrap, 'wrap');
  for (const style of [styles.primary, styles.search, styles.secondary, styles.tile, styles.chip, list.mode, list.seeAllButton]) {
    assert.ok(style.minHeight >= 44); assert.equal(style.height, undefined);
  }
  for (const isDriver of [true, false]) {
    for (const n of nodes(HomeDashboardActions.type(actions({ isDriver }))).filter(n => n.type === 'Text')) {
      assert.equal(n.props.numberOfLines, undefined);
      assert.notEqual(n.props.allowFontScaling, false);
    }
  }
});

test('loading or failed discovery never hides personal reservations supplied separately', () => {
  const hooks = hookHarness();
  const { useHomeSheet } = loader({ react: hooks.react, 'react-native': native })('hooks/home/useHomeSheet.ts');
  const props = { isDriver: false, insets: { bottom: 34 }, latestTrips: [{ id: 'reserved' }],
    availableDriverRequests: [], tripsLoading: true, tripsError: false };
  const draw = () => hooks.render(() => useHomeSheet(props));
  assert.equal(draw().sheetLoading, false);
  props.tripsLoading = false; props.tripsError = true;
  assert.equal(draw().sheetError, false);
  props.latestTrips = []; assert.equal(draw().sheetError, true);
  hooks.unmount();
});
