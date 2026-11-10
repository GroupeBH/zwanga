const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
function text(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(text).join('');
  return React.isValidElement(node) ? text(node.props.children) : '';
}
function fixture(patch = {}) {
  const h = hookHarness(), calls = [];
  const load = loader({ react: { ...React, ...h.react },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
      StyleSheet: { create: x => x, hairlineWidth: 1 } }, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/request-detail/WithdrawRequestDriverButton': { TripDriverWithdrawal: 'Withdrawal' },
    '@/features/manage-trip/ManageTripBookings': { ManageTripBookings: 'Bookings' },
    '@/features/manage-trip/ManageTripBookingsReadState': { ManageTripBookingsReadState: 'ReadState' },
    '@/features/manage-trip/ManageTripInterruptionNotice': { ManageTripInterruptionNotice: 'InterruptionNotice' },
  });
  const trip = { id: 'trip', price: 2500, status: 'upcoming', departureTime: '2030-01-01T09:00:00Z',
    acceptedPaymentModes: ['cash', 'points'], ...patch };
  const w = { ready: true, busy: false, state: { trip, bookings: [], isScreenActive: true, isOwner: true,
    router: { push: route => calls.push(route) }, refetchBookings() {} }, bookingsActions: {},
    actions: Object.fromEntries(['handleStartTrip', 'handleOpenNavigation', 'handleCancelTrip', 'handleOpenTripEdit', 'handlePauseTrip']
      .map(name => [name, () => calls.push(name)])) };
  const model = { data: { trip, tripBookings: [], passengersFirst: false }, config: { label: 'À venir', color: 'green' },
    presentation: { routeLabels: { departure: { title: 'Avenue des Aviateurs', context: 'Gombe', reference: 'Portail bleu' },
      arrival: { title: 'Kintambo Magasin', context: 'Kinshasa' } }, tripPriceLabel: '2 500 FC', tripSeatsLabel: '3 places',
      tripVehicleLabel: 'Voiture', tripVehicleMetaLabel: 'Voiture · Gris', tripVehicleIconName: 'car', tripRouteDistanceLabel: '8 km' },
    bookingState: { setVehicleDetailModalVisible: () => calls.push('vehicle') } };
  const render = (file, props) => h.render(() => load(`features/trip-detail/${file}.tsx`)[file](props));
  return { h, load, w, model, calls, render, header: () => render('DriverTripHeaderActions', { workspace: w }),
    bar: () => render('DriverTripActionsBar', { workspace: w, bottomInset: 24, goHome: () => {} }),
    content: () => render('DriverTripDetailContent', { workspace: w, model }) };
}

test('published owner header exposes named edit/cancel icon buttons; footer only starts the trip', () => {
  const f = fixture(); const header = nodes(f.header()).filter(n => n.type === 'Button');
  assert.deepEqual(header.map(n => n.props.accessibilityLabel), ['Modifier le trajet', 'Annuler le trajet']);
  assert.equal(text(f.header()), '');
  header.forEach(button => button.props.onPress()); assert.deepEqual(f.calls, ['handleOpenTripEdit', 'handleCancelTrip']);
  const separate = fixture(), buttons = nodes(separate.bar()).filter(n => n.type === 'Button');
  assert.deepEqual(buttons.map(n => n.props.accessibilityLabel), ['Démarrer le trajet']);
  assert.equal(text(separate.bar()).includes('Gérer'), false);
  assert.ok(f.load('features/trip-detail/DriverTripWorkspace.styles.ts').driverTripStyles.headerIcon.width >= 44);
  f.h.unmount(); separate.h.unmount();
});

test('unready or busy owner actions are disabled; ongoing interruption replaces upcoming cancellation', () => {
  for (const patch of [{ ready: false }, { busy: true }]) {
    const f = fixture(); Object.assign(f.w, patch);
    assert.equal(nodes(f.header()).find(n => n.props.accessibilityLabel === 'Annuler le trajet').props.disabled, true);
    const b = fixture(); Object.assign(b.w, patch);
    assert.equal(nodes(b.bar()).find(n => n.type === 'Button').props.disabled, true);
  }
  const f = fixture({ status: 'ongoing' });
  assert.deepEqual(nodes(f.header()).filter(n => n.type === 'Button').map(n => n.props.accessibilityLabel), ['Modifier le trajet', 'Interrompre le trajet']);
  const b = fixture({ status: 'ongoing' }); assert.equal(text(b.bar()), 'Reprendre la navigation');
});

test('completed, expired and request-linked trips retain their dedicated actions', () => {
  const completed = fixture({ status: 'completed' });
  assert.equal(nodes(completed.header()).filter(n => n.type === 'Button').length, 0);
  const done = fixture({ status: 'completed' }); const rating = nodes(done.bar()).find(n => n.type === 'Button');
  rating.props.onPress(); assert.deepEqual(done.calls, ['/rate/trip']);
  const expired = fixture({ canReprogram: true, isExpired: true }); assert.equal(text(expired.bar()), 'Reprogrammer le trajet');
  const cancelled = fixture({ status: 'cancelled' }); assert.equal(cancelled.bar(), null);
  const request = fixture({ tripRequestId: 'request' });
  assert.equal(nodes(request.header()).some(n => n.props.accessibilityLabel === 'Annuler le trajet'), false);
  const r = fixture({ tripRequestId: 'request' }); assert.equal(nodes(r.bar()).filter(n => n.type === 'Withdrawal').length, 1);
});

test('device time alone does not remove the existing owner start/edit/cancel actions', () => {
  const late = fixture({ departureTime: '2000-01-01T09:00:00Z' });
  assert.equal(text(late.bar()), 'Démarrer le trajet');
  const header = fixture({ departureTime: '2000-01-01T09:00:00Z' });
  assert.deepEqual(nodes(header.header()).filter(n => n.type === 'Button').map(n => n.props.accessibilityLabel),
    ['Modifier le trajet', 'Annuler le trajet']);
});

test('secondary vehicle/payment details collapse without losing the addresses, reference or original fare unit', () => {
  const f = fixture(); let view = f.content();
  const route = nodes(view).find(n => n.props.labels === f.model.presentation.routeLabels);
  assert.equal(route.props.showContext, false);
  assert.ok(text(view).includes('2 500 FC / place')); assert.equal(text(view).includes('Paiements'), false);
  nodes(view).find(n => n.props.accessibilityLabel === 'Véhicule, adresses et paiements').props.onPress();
  view = f.content(); assert.equal(nodes(view).find(n => n.props.labels).props.showContext, true);
  assert.ok(text(view).includes('Paiements : Cash · Jetons'));
  const request = fixture({ tripRequestId: 'request' }); assert.ok(text(request.content()).includes('2 500 FC pour le trajet'));
});

test('pending passenger actions open in the same detail and are disabled during stale reads', () => {
  const f = fixture(); f.model.data.tripBookings = [{ id: 'booking', status: 'pending' }];
  f.w.ready = false; const view = f.content(), bookings = nodes(view).find(n => n.type === 'Bookings');
  assert.ok(text(view).includes('1 à confirmer'));
  assert.equal(bookings.props.compact, true); assert.equal(bookings.props.actionsDisabled, true);
  assert.equal(bookings.props.bookingsActions, f.w.bookingsActions);
  assert.equal(bookings.props.tracking.visibleBookings, f.model.data.tripBookings);
});

test('compact address context is opt-in, full accessibility label and pickup reference remain intact', () => {
  const f = fixture();
  const render = showContext => {
    const C = f.load('components/trip/RouteLocationDetails.tsx').RouteLocationDetails.type;
    const tree = C({ labels: f.model.presentation.routeLabels, showContext });
    return nodes(tree).flatMap(n => typeof n.type === 'function' ? nodes(n.type(n.props)) : [n]);
  };
  assert.ok(render(false).some(n => n.props.accessibilityLabel?.includes('Gombe')));
  assert.ok(render(false).some(n => text(n) === 'Référence : Portail bleu'));
  assert.equal(render(false).some(n => n.type === 'Text' && text(n) === 'Gombe'), false);
  assert.ok(render(undefined).some(n => n.type === 'Text' && text(n) === 'Gombe'));
});
