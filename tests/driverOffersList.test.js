const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { View: 'View', Text: 'Text', Pressable: 'Button', FlatList: 'List', RefreshControl: 'Refresh',
  ActivityIndicator: 'Spinner', StyleSheet: { create: s => s } };
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree)
  ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');
const request = { id: 'request', passengerId: 'passenger', status: 'offers_received', departureLocation: 'Gombe',
  arrivalLocation: 'Lemba', departureDateMin: '2099-01-01T10:00:00Z', departureDateMax: '2099-01-01T11:00:00Z',
  numberOfSeats: 2, passenger: { firstName: 'Passager', lastName: 'Test' } };
const offer = { id: 'offer', driverId: 'driver', status: 'pending', pricePerSeat: 1500, tripRequest: request };

function fixture(t) {
  const hooks = hookHarness(), queries = [], opened = [];
  const state = { user: 'driver', active: true, online: true, version: 1, refreshes: 0,
    query: { currentData: { data: [offer], nextCursor: 'cursor' } } };
  const load = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { id: state.user } }, zwangaApi: { config: { online: state.online } } }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
    '@/store/api/tripRequestApi': { useGetMyOfferPageQuery: (args, options) => {
      queries.push({ args, options }); return { ...state.query, refetch: () => { state.refreshes++; } };
    } },
    '@/components/trip/CompactTripCard': { CompactTripCard: 'Card' },
    '@/components/ui/HistoryPagination': { HistoryPagination: 'Pagination' },
    './RequestsListState': { RequestsListState: 'Empty' },
  });
  const { DriverOffersList } = load('features/requests/DriverOffersList.tsx');
  t.after(() => hooks.unmount());
  return { state, queries, opened, render: () => hooks.render(() => DriverOffersList({ onOpen: id => opened.push(id) })) };
}

test('sent offer list displays server price and opens its request; pages remain bounded', t => {
  const f = fixture(t), tree = f.render(), card = tree.props.renderItem({ item: offer });
  assert.equal(card.props.label, 'En attente du passager');
  assert.equal(card.props.priceText.replace(/\D/g, ''), '3000');
  assert.equal(card.props.priceHint, 'pour le trajet');
  card.props.onPress(); assert.deepEqual(f.opened, ['request']);
  assert.equal(f.queries[0].args.limit, 20); assert.equal(tree.props.initialNumToRender, 6);
  tree.props.ListFooterComponent.props.onNext(); f.render();
  assert.deepEqual(f.queries.at(-1).args, { before: 'cursor', limit: 20 });
});

test('offer reads pause offline/background, preserve cached rows and isolate accounts', t => {
  const f = fixture(t); f.render();
  f.state.online = false; f.state.query = { currentData: undefined }; let tree = f.render();
  assert.equal(tree.props.data.length, 1);
  assert.equal(f.queries.at(-1).options.skip, true); assert.equal(f.queries.at(-1).options.pollingInterval, 0);
  tree.props.refreshControl.props.onRefresh(); assert.equal(f.state.refreshes, 0);
  f.state.online = true; f.state.active = false; f.render(); assert.equal(f.queries.at(-1).options.skip, true);
  f.state.active = true; f.state.user = 'another'; f.state.version++;
  f.state.query = { currentData: { data: [offer] } }; tree = f.render();
  assert.equal(tree.props.data.length, 0, 'previous account offers never leak');
});

test('closed or rejected proposals cannot accept a closed request; accepted assignment remains accessible', t => {
  const f = fixture(t), tree = f.render();
  for (const status of ['rejected', 'cancelled']) {
    const card = tree.props.renderItem({ item: { ...offer, status } });
    assert.equal(card.props.disabled, true); card.props.onPress();
  }
  assert.deepEqual(f.opened, []);
  const assigned = tree.props.renderItem({ item: { ...offer, status: 'accepted', tripRequest: { ...request, status: 'driver_selected' } } });
  assert.equal(assigned.props.disabled, false); assigned.props.onPress(); assert.deepEqual(f.opened, ['request']);
});

test('pending offer withdrawal stays visible independently of vehicle, KYC, or driver deadline', () => {
  const load = loader({ react: React, 'react-native': native,
    './requestDetailModel': { formatCdfPrice: price => `${price} FC` } });
  const { RequestPendingOfferActions } = load('features/request-detail/RequestPendingOfferActions.tsx');
  let withdrawals = 0;
  const model = { tripRequest: { ...request, offers: [offer] }, userId: 'driver', isScreenActive: true,
    canRespondToRequest: true, canAcceptDirectly: false, isIdentityVerified: false, handleDeclineTripRequest: () => { withdrawals++; } };
  const tree = RequestPendingOfferActions({ model }); assert.match(words(tree), /Votre prix.*3 000 FC.*pour le trajet/);
  assert.doesNotMatch(words(tree), /par place|\/ place/);
  nodes(tree).find(n => n.type === 'Button').props.onPress(); assert.equal(withdrawals, 1);
  const busy = RequestPendingOfferActions({ model: { ...model, isDecliningTripRequest: true } });
  const button = nodes(busy).find(n => n.type === 'Button'); assert.equal(button.props.disabled, true);
  button.props.onPress(); assert.equal(withdrawals, 1);
  for (const patch of [{ userId: 'passenger' }, { userId: 'other' }, { tripRequest: { ...model.tripRequest, selectedDriverId: 'driver', status: 'driver_selected' } }]) {
    assert.equal(RequestPendingOfferActions({ model: { ...model, ...patch } }), null);
  }
});
