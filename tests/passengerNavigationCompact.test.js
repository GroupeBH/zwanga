const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const all = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(all) : [n, ...all(n.props?.children)];
const words = n => typeof n === 'string' ? n : Array.isArray(n) ? n.map(words).join(' ') : n?.props ? words(n.props.children) : '';
const flat = value => Object.assign({}, ...[value].flat(Infinity).filter(Boolean));
const native = { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
  StyleSheet: { create: s => s }, useWindowDimensions: () => ({ width: 320, height: 640 }) };

function fixture() {
  const hooks = hookHarness(), calls = [];
  const Component = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/utils/reanimated': { default: { View: 'Animated' }, FadeInUp: { duration: () => ({ delay: () => null }) } },
    '../screen-styles/app/booking/navigate/detail/index': { styles: { infoCard: { position: 'absolute', padding: 24 } } },
    '@/features/ride-recovery/RideRecoveryControl': { RideRecoveryControl: 'Recovery' },
    '@/components/trip/PausedPassengerRideNotice': { PausedPassengerRideNotice: 'Paused' },
  })('features/passenger-navigation/PassengerNavigationInfoCard.tsx').PassengerNavigationInfoCard;
  const props = { data: { tripId: 't', trip: { id: 't', status: 'ongoing' },
    booking: { id: 'b', tripId: 't', status: 'accepted', passengerOrigin: 'Point de départ complet', passengerDestination: 'Destination longue', pickedUp: false },
    isTripOngoing: true, insets: { bottom: 24 } }, state: {}, presentation: { canCancelPassengerTrip: true },
    interruption: {}, tripActions: { confirmCancelPassengerTrip: () => calls.push('cancel') } };
  return { props, hooks, calls, render: () => hooks.render(() => Component(props)) };
}

test('panel is bounded in normal flow; details reveal the route and cancellation without hiding confirmation', () => {
  const f = fixture(); let tree = f.render();
  assert.equal(flat(tree.props.style).position, 'relative');
  assert.equal(flat(tree.props.style).maxHeight, 640 * 0.36);
  assert.ok(all(tree).some(n => n.type === 'Scroll'));
  assert.equal(all(tree).find(n => n.type === 'Recovery').props.condensed, true);
  assert.doesNotMatch(words(tree), /Point de départ complet|Annuler ma participation|Tracking|Détection automatique/);
  let toggle = all(tree).find(n => n.props.accessibilityLabel === 'Détails du trajet');
  assert.equal(toggle.props.accessibilityState.expanded, false);
  assert.ok(flat(toggle.props.style).minHeight >= 44);
  toggle.props.onPress(); tree = f.render();
  assert.equal(flat(tree.props.style).maxHeight, 640 * 0.5);
  assert.match(words(tree), /Point de départ complet/);
  const cancel = all(tree).find(n => n.type === 'Button' && words(n).includes('Annuler ma participation'));
  cancel.props.onPress(); assert.deepEqual(f.calls, ['cancel']);
  assert.ok(all(tree).some(n => n.type === 'Recovery'));
  f.props.data.isCancellingBooking = true;
  assert.equal(all(f.render()).find(n => n.type === 'Button' && words(n).includes('Annulation')).props.disabled, true);
  toggle = all(f.render()).find(n => n.props.accessibilityLabel === 'Détails du trajet'); toggle.props.onPress();
  assert.doesNotMatch(words(f.render()), /Point de départ complet/);
  f.hooks.unmount();
});

test('driver interruption response and paused-ride recovery do not depend on expanded details', () => {
  const f = fixture(); f.props.interruption = { pendingDriverInterruptionRequest: { reason: 'other' },
    canRespondToDriverInterruption: true, handleConfirmDriverInterruption: () => f.calls.push('confirm'), handleRejectDriverInterruption: () => f.calls.push('reject') };
  let tree = f.render();
  assert.match(words(tree), /Le conducteur veut interrompre/);
  all(tree).find(n => n.type === 'Button' && words(n).trim() === 'Confirmer').props.onPress();
  all(tree).find(n => n.type === 'Button' && words(n).trim() === 'Refuser').props.onPress();
  assert.deepEqual(f.calls, ['confirm', 'reject']);
  f.props.data.trip = { ...f.props.data.trip, status: 'upcoming', interruptionRequest: { status: 'confirmed' } };
  tree = f.render(); assert.ok(all(tree).some(n => n.type === 'Paused')); assert.match(words(tree), /en pause/);
  f.hooks.unmount();
});

test('map tools keep three primary controls and expose centering/refresh only on demand', () => {
  const hooks = hookHarness(), calls = [];
  const Component = loader({ react: { ...React, ...hooks.react }, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } })('features/passenger-navigation/PassengerMapControls.tsx').PassengerMapControls;
  const model = { data: { insets: { right: 0, bottom: 34 } }, presentation: { canCenterOnPassenger: true },
    state: { isMapExpanded: false, driverLocation: null, isLoadingRoute: false, routeFetchedRef: { current: true }, lastRouteFetchRef: { current: 10 },
      setIsMapExpanded: fn => { model.state.isMapExpanded = fn(model.state.isMapExpanded); } },
    camera: { fitToRoute: () => calls.push('fit'), centerOnDriver: () => calls.push('driver'), centerOnPassenger: () => calls.push('me') },
    route: { fetchRoute: () => calls.push('refresh') } };
  const render = () => hooks.render(() => Component({ model }));
  const button = label => all(render()).find(n => n.props.accessibilityLabel === label);
  assert.equal(all(render()).filter(n => n.type === 'Button').length, 3);
  button('Voir tout l’itinéraire').props.onPress(); button('Agrandir la carte').props.onPress();
  assert.equal(flat(render().props.style).bottom, 34);
  button('Outils de la carte').props.onPress();
  assert.equal(button('Centrer sur le conducteur').props.disabled, true);
  button('Centrer sur ma position').props.onPress(); button('Actualiser l’itinéraire').props.onPress();
  assert.equal(model.state.routeFetchedRef.current, false); assert.equal(model.state.lastRouteFetchRef.current, 0);
  assert.deepEqual(calls, ['fit', 'me', 'refresh']);
  model.state.isLoadingRoute = true; assert.equal(button('Actualiser l’itinéraire').props.disabled, true);
  button('Outils de la carte').props.onPress(); assert.equal(all(render()).filter(n => n.type === 'Button').length, 3);
  hooks.unmount();
});
