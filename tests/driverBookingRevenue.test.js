const assert = require('node:assert/strict');
const { test } = require('node:test');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const all = node => Array.isArray(node) ? node.flatMap(all) : node?.props ? [node, ...all(node.props.children)] : [];
const words = node => typeof node === 'string' || typeof node === 'number' ? String(node) : Array.isArray(node) ? node.map(words).join(' ') : node?.props ? words(node.props.children) : '';
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', ScrollView: 'Scroll', StyleSheet: { create: value => value } };
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

test('navigation displays the latest confirmed passenger, retains other receipts and ignores pending/offline declarations', () => {
  const hooks = hookHarness();
  const { DriverDropoffReceipts, getConfirmedDropoffs } = loader({
    react: { ...React, ...hooks.react, memo: component => component }, 'react-native': native,
    '@/features/driver-payments/DriverBookingRevenue': { DriverBookingRevenue: 'Revenue' },
  })('features/driver-navigation/DriverDropoffReceipts.tsx');
  const one = { id: 'one', tripId: 't', passengerName: 'Alice', status: 'completed', droppedOffAt: '2026-09-22T09:00:00Z' };
  const two = { ...one, id: 'two', passengerName: 'Bob', droppedOffAt: '2026-09-22T10:00:00Z' };
  let bookings = [one, two, { ...one, id: 'pending', status: 'accepted', droppedOffAt: undefined }, { ...one, id: 'cancelled', status: 'cancelled' }, { ...two, id: 'elsewhere', tripId: 'other' }];
  assert.deepEqual(getConfirmedDropoffs(bookings, 't').map(value => value.id), ['two', 'one']);
  const render = () => hooks.render(() => DriverDropoffReceipts({ bookings, tripId: 't', active: true }));
  assert.equal(all(render()).find(node => node.type === 'Revenue').props.bookingId, 'two');
  all(render()).find(node => node.type === 'Button' && words(node) === 'Alice').props.onPress();
  assert.equal(all(render()).find(node => node.type === 'Revenue').props.bookingId, 'one');
  bookings = [...bookings, { ...two, id: 'three', passengerName: 'Chloé', droppedOffAt: '2026-09-22T11:00:00Z' }];
  assert.equal(all(render()).find(node => node.type === 'Revenue').props.bookingId, 'three');
  assert.equal(all(render()).filter(node => node.type === 'Revenue').length, 1, 'only the selected receipt reads its balance');
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
