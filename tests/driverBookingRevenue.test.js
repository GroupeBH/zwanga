const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const all = node => Array.isArray(node) ? node.flatMap(all) : node?.props ? [node, ...all(node.props.children)] : [];
const words = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(words).join(' ') : node?.props ? words(node.props.children) : '';
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', ScrollView: 'Scroll', FlatList: 'List', StyleSheet: { create: value => value } };
const summary = patch => ({ bookingId: 'b', tripId: 't', dropoffConfirmed: true, ledgerVerified: true,
  currency: 'CDF', totalExpectedAmount: 5000, confirmedAmount: 3000, cashToCollectAmount: 2000,
  creditPendingAmount: 0, electronicPendingAmount: 0, pointsPendingAmount: 0, ...patch });

function receipt() {
  let data = summary(), error = false, requests = 0;
  const queries = [];
  const { DriverBookingRevenue } = loader({
    react: { ...React, memo: component => component }, 'react-native': native,
    '@/store/api/driverSettlementsApi': { useGetDriverBookingRevenueSummaryQuery: (id, options) => {
      queries.push({ id, options }); return { currentData: data, isFetching: false, isError: error, refetch: () => { requests++; } };
    } },
  })('features/driver-payments/DriverBookingRevenue.tsx');
  return { render: (props = {}) => DriverBookingRevenue({ bookingId: 'b', active: true, ...props }), queries,
    data: value => { data = value; }, error: value => { error = value; }, requests: () => requests };
}

test('dropoff receipt distinguishes net credited gain from cash still owed', () => {
  const app = receipt(); const text = words(app.render()).replace(/\s+/g, ' ');
  assert.match(text, /Total pour ce passager 5 000 CDF/);
  assert.match(text, /Gains crédités 3 000 CDF/);
  assert.match(text, /À recevoir en cash 2 000 CDF/);
  assert.match(text, /pas dans votre solde/);
  assert.equal(app.requests(), 0, 'rendering neither mutates money nor refetches in a loop');
});

test('electronic and points amounts awaiting payment are never shown as credited', () => {
  const app = receipt();
  for (const [field, label] of [['electronicPendingAmount', 'Paiement électronique attendu'], ['pointsPendingAmount', 'Paiement en jetons attendu']]) {
    app.data(summary({ confirmedAmount: 0, cashToCollectAmount: 0, totalExpectedAmount: 4750, [field]: 4750 }));
    const text = words(app.render()).replace(/\s+/g, ' ');
    assert.match(text, new RegExp(`${label} 4 750 CDF`));
    assert.doesNotMatch(text, /Gains crédités 4 750|À recevoir en cash/);
  }
});

test('explicit cash receipt changes the cash label but never increases platform earnings', () => {
  const app = receipt(); app.data(summary());
  const text = words(app.render({ cashReceived: true })).replace(/\s+/g, ' ');
  assert.match(text, /Cash reçu 2 000 CDF/);
  assert.match(text, /pas dans votre solde de revenus/);
  assert.doesNotMatch(text, /Gains crédités 5 000/);
});

test('loading, errors, stale passenger data and unconfirmed drops never become invented zero earnings', () => {
  const app = receipt();
  app.data(undefined);
  assert.match(words(app.render()), /Vérification du gain/);
  assert.doesNotMatch(words(app.render()), /0 CDF/);
  app.error(true); assert.match(words(app.render()), /indisponible/);
  app.error(false); app.data(summary({ bookingId: 'another' }));
  assert.doesNotMatch(words(app.render()), /3.000|5.000/);
  app.data(summary({ dropoffConfirmed: false }));
  assert.match(words(app.render()), /pas encore confirmé/);
  assert.doesNotMatch(words(app.render()), /3.000|5.000/);
  app.data(summary({ totalExpectedAmount: 0, confirmedAmount: 0, cashToCollectAmount: 0 }));
  assert.match(words(app.render()), /0 CDF/);
});

test('receipt pauses off-screen and exposes an explicit read-only retry without polling', () => {
  const app = receipt();
  app.render({ active: false });
  assert.equal(app.queries.at(-1).options.skip, true);
  app.data(undefined); app.error(true);
  const tree = app.render();
  assert.equal(app.queries.at(-1).options.skip, false);
  assert.equal(app.queries.at(-1).options.pollingInterval, undefined);
  all(tree).find(node => node.type === 'Button').props.onPress();
  assert.equal(app.requests(), 1);
});

test('compact navigation shows latest dropoff, opens details explicitly and closes on blur or trip change', () => {
  const hooks = hookHarness();
  const { DriverDropoffReceipts, getConfirmedDropoffs } = loader({
    react: { ...React, ...hooks.react, memo: component => component }, 'react-native': native,
    '@/features/driver-payments/DriverBookingRevenue': { DriverBookingRevenue: 'Revenue' },
    './DriverDropoffReceiptsSheet': { DriverDropoffReceiptsSheet: 'Sheet' },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
    '@/features/navigation/RideOverlayProvider': { useRideOverlay: () => ({ active: null }) },
    '@/components/home/SwipeableHomePriority': { SwipeableHomePriority: 'Swipe' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
  })('features/driver-navigation/DriverDropoffReceipts.tsx');
  const one = { id: 'one', tripId: 't', passengerName: 'Alice', status: 'completed', droppedOffAt: '2026-09-22T09:00:00Z' };
  const two = { ...one, id: 'two', passengerName: 'Bob', droppedOffAt: '2026-09-22T10:00:00Z' };
  let bookings = [one, two, { ...one, id: 'pending', status: 'accepted', droppedOffAt: undefined }, { ...one, id: 'cancelled', status: 'cancelled' }, { ...two, id: 'elsewhere', tripId: 'other' }];
  assert.deepEqual(getConfirmedDropoffs(bookings, 't').map(value => value.id), ['two', 'one']);
  let active = true, tripId = 't';
  const render = () => hooks.render(() => DriverDropoffReceipts({ bookings, tripId, active }));
  assert.equal(all(render()).find(node => node.type === 'Revenue').props.bookingId, 'two');
  assert.equal(all(render()).find(node => node.type === 'Revenue').props.compact, true);
  assert.equal(all(render()).filter(node => node.type === 'Sheet').length, 0);
  all(render()).find(node => node.type === 'Button').props.onPress();
  assert.equal(all(render()).find(node => node.type === 'Sheet').props.bookings.length, 2);
  assert.equal(all(render()).filter(node => node.type === 'Revenue').length, 0, 'no second summary subscription while the detail is open');
  all(render()).find(node => node.type === 'Modal').props.onRequestClose();
  bookings = [...bookings, { ...two, id: 'three', passengerName: 'Chloé', droppedOffAt: '2026-09-22T11:00:00Z' }];
  assert.equal(all(render()).find(node => node.type === 'Revenue').props.bookingId, 'three');
  assert.equal(all(render()).filter(node => node.type === 'Revenue').length, 1, 'only the selected receipt reads its balance');
  assert.equal(all(render()).find(node => node.type === 'Modal').props.visible, false, 'new dropoffs never open a modal automatically');
  all(render()).find(node => node.type === 'Button').props.onPress();
  active = false;
  assert.equal(all(render()).find(node => node.type === 'Modal').props.visible, false);
  assert.equal(all(render()).find(node => node.type === 'Revenue').props.active, false);
  active = true; assert.equal(all(render()).find(node => node.type === 'Modal').props.visible, false);
  all(render()).find(node => node.type === 'Button').props.onPress(); tripId = 'other';
  assert.equal(all(render()).find(node => node.type === 'Modal').props.visible, false);
  tripId = 't'; bookings = Array.from({ length: 100 }, (_, index) => ({ ...one, id: `b${index}` }));
  assert.equal(all(render()).filter(node => node.type === 'Button').length, 1, '100 dropoffs still occupy one compact touch target on the map');
  assert.equal(all(render()).filter(node => node.type === 'Revenue').length, 1);
  hooks.unmount();
});

test('swiping hides only the receipt UI until a new dropoff, not a refetch or payment update', () => {
  const hooks = hookHarness();
  let overlay = null;
  const { DriverDropoffReceipts } = loader({
    react: { ...React, ...hooks.react, memo: component => component }, 'react-native': native,
    '@/features/driver-payments/DriverBookingRevenue': { DriverBookingRevenue: 'Revenue' },
    './DriverDropoffReceiptsSheet': { DriverDropoffReceiptsSheet: 'Sheet' },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
    '@/features/navigation/RideOverlayProvider': { useRideOverlay: () => ({ active: overlay }) },
    '@/components/home/SwipeableHomePriority': { SwipeableHomePriority: 'Swipe' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
  })('features/driver-navigation/DriverDropoffReceipts.tsx');
  const first = { id: 'first', tripId: 't', status: 'completed', updatedAt: '2026-09-23T10:00:00Z' };
  const props = { bookings: [first, { ...first, id: 'second' }], tripId: 't', active: true };
  const render = () => hooks.render(() => DriverDropoffReceipts(props));
  const find = type => all(render()).find(node => node.type === type);
  const swipe = find('Swipe');
  assert.equal(swipe.props.enabled, true);
  assert.equal(swipe.props.dismissLabel, 'Masquer le récapitulatif');
  swipe.props.onDismiss(swipe.props.priorityKey);
  assert.equal(render(), null, 'the hidden banner has no mounted query or overlay');
  props.bookings = props.bookings.map(value => ({ ...value, updatedAt: '2026-09-23T11:00:00Z', cashReceivedAt: 'now' })).reverse();
  assert.equal(render(), null);
  props.active = false; assert.equal(render(), null);
  props.active = true; assert.equal(render(), null, 'refocus alone does not undo the dismissal while mounted');
  props.bookings = [...props.bookings, { ...first, id: 'third' }];
  const next = find('Swipe'); assert.notEqual(next.props.priorityKey, swipe.props.priorityKey);
  next.props.onDismiss(swipe.props.priorityKey); assert.ok(render(), 'an obsolete receipt key cannot dismiss new dropoffs');
  props.active = false;
  assert.equal(find('Swipe').props.enabled, false);
  find('Swipe').props.onDismiss(next.props.priorityKey);
  props.active = true; assert.ok(render());
  overlay = { id: 'options-receipts' };
  assert.equal(find('Swipe').props.enabled, false);
  assert.equal(find('Revenue').props.active, false, 'no duplicate summary reads behind a panel opened from Options');
  find('Swipe').props.onDismiss(next.props.priorityKey);
  overlay = null;
  find('Button').props.onPress();
  assert.equal(find('Swipe').props.enabled, false);
  assert.equal(find('Modal').props.visible, true);
  find('Swipe').props.onDismiss(next.props.priorityKey); assert.ok(render());
  find('Modal').props.onRequestClose();
  const button = find('Button');
  assert.deepEqual(button.props.accessibilityActions, [{ name: 'dismiss', label: 'Masquer le récapitulatif' }]);
  button.props.onAccessibilityAction({ nativeEvent: { actionName: 'dismiss' } });
  assert.equal(render(), null);
  assert.equal(first.status, 'completed'); assert.equal(first.cashReceivedAt, undefined);
  hooks.unmount();
});

test('compact amount never presents cash or expected payments as credited earnings', () => {
  const app = receipt();
  const compact = () => words(app.render({ compact: true })).replace(/\s+/g, ' ');
  assert.match(compact(), /5 000 CDF Total · voir le détail/);
  assert.doesNotMatch(compact(), /Actualiser|pas dans votre solde/);
  app.data(summary({ confirmedAmount: 0, cashToCollectAmount: 5000 }));
  assert.match(compact(), /Cash à recevoir/);
  assert.match(words(app.render({ compact: true, cashReceived: true })), /Cash reçu/);
  app.data(summary({ confirmedAmount: 5000, cashToCollectAmount: 0 }));
  assert.match(compact(), /Gains crédités/);
  app.data(summary({ confirmedAmount: 3000, cashToCollectAmount: 0 }));
  assert.doesNotMatch(compact(), /Gains crédités/, 'a partial credit cannot label the full expected total');
  app.data(summary({ confirmedAmount: 0, cashToCollectAmount: 0, pointsPendingAmount: 5000 }));
  assert.match(compact(), /Paiement attendu/);
  app.data(undefined); app.error(true);
  assert.match(compact(), /Voir le gain À actualiser/); assert.doesNotMatch(compact(), /0 CDF/);
  app.error(false); app.data(summary({ bookingId: 'another' }));
  assert.doesNotMatch(compact(), /5 000|3 000/);
  assert.equal(all(app.render({ compact: true })).filter(node => node.type === 'Button').length, 0, 'no nested refresh touch target inside the compact bar');
});

test('many passengers remain in one bounded virtualized sheet with a single expanded receipt', () => {
  const hooks = hookHarness();
  const { DriverDropoffReceiptsSheet } = loader({
    react: { ...React, ...hooks.react, memo: component => component }, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/features/driver-payments/DriverBookingRevenue': { DriverBookingRevenue: 'Revenue' },
    '@/features/driver-payments/ConfirmCashReceipt': { ConfirmCashReceipt: 'CashReceipt' },
  })('features/driver-navigation/DriverDropoffReceiptsSheet.tsx');
  let bookings = Array.from({ length: 100 }, (_, index) => ({ id: `b${index}`, passengerName: `Passager ${index}`, cashReceivedAt: null }));
  const props = () => ({ bookings, active: true, onClose() {} });
  const render = () => hooks.render(() => DriverDropoffReceiptsSheet(props()));
  const list = () => all(render()).find(node => node.type === 'List');
  assert.equal(all(render()).find(node => node.type === 'SafeArea').props.style.height, '80%');
  assert.equal(list().props.initialNumToRender, 6); assert.equal(list().props.windowSize, 3);
  assert.equal(list().props.removeClippedSubviews, false);
  assert.equal(list().props.keyExtractor(bookings[12]), 'b12');
  const rows = () => bookings.flatMap((item, index) => all(list().props.renderItem({ item, index })));
  assert.equal(rows().filter(node => node.type === 'Revenue').length, 1);
  const second = list().props.renderItem({ item: bookings[1], index: 1 });
  all(second).find(node => node.type === 'Button').props.onPress();
  bookings = [{ id: 'new', passengerName: 'Nouveau passager' }, ...bookings];
  assert.equal(rows().find(node => node.type === 'Revenue').props.bookingId, 'b1', 'new arrivals must not replace an ongoing cash confirmation');
  assert.equal(rows().find(node => node.type === 'CashReceipt').props.booking.id, 'b1');
  bookings = bookings.filter(item => item.id !== 'b1');
  assert.equal(rows().find(node => node.type === 'Revenue').props.bookingId, 'new');
  hooks.unmount();
});

test('RTK booking summary is a scoped read invalidated by settlement and booking updates', () => {
  let endpoints;
  loader({ './baseApi': { baseApi: { injectEndpoints: options => {
    endpoints = options.endpoints({ query: value => value, mutation: value => value }); return {};
  } } } })('store/api/driverSettlementsApi.ts');
  const endpoint = endpoints.getDriverBookingRevenueSummary;
  assert.equal(endpoint.query('b'), '/driver-settlements/bookings/b/revenue-summary');
  assert.deepEqual(endpoint.providesTags(undefined, undefined, 'b'), [{ type: 'DriverSettlement', id: 'ME' }, { type: 'Booking', id: 'b' }]);
  assert.equal(endpoint.keepUnusedDataFor, 60);
});
