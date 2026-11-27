const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { model, presentation, request, labels } = require('./helpers/confirmedRequestFixture.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join(' ') : text(tree?.props?.children ?? '');
const native = { View: 'View', Text: 'Text', Pressable: 'Button', ScrollView: 'Scroll', RefreshControl: 'Refresh',
  ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } };

test('confirmed detail always shows the route and keeps concise addresses, total and actions', t => {
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  const calls = [];
  const { RequestConfirmedScreen } = loader({ react: hooks.react, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/hooks/useRouteLocationLabels': { useRouteLocationLabels: () => ({ ...labels, arrival: { ...labels.arrival, reference: 'Entrée test' } }) },
    './CollapsibleRouteMap': { CollapsibleRouteMap: 'Map' }, './RequestConfirmedDriver': { RequestConfirmedDriver: 'Driver' },
    '@/features/ride-payment/RidePaymentNotice': { RidePaymentNotice: 'PaymentNotice' },
    './ChangeRequestDriverButton': { ChangeRequestDriverButton: 'Change' }, './RequestOwnerModals': { RequestOwnerModals: 'Modals' },
  })('features/request-detail/RequestConfirmedScreen.tsx');
  const current = { ...model, handleViewTrip: id => calls.push(id), handleCancelRequest: () => calls.push('cancel') };
  const draw = () => hooks.render(() => RequestConfirmedScreen({ model: current, presentation }));
  let tree = draw();
  const map = nodes(tree).find(n => n.type === 'Map');
  assert.equal(map.props.displayMode, 'overview'); assert.equal(map.props.showRecenter, true);
  assert.equal(map.props.mapData, presentation.requestRouteMapData); assert.equal(map.props.routeCoordinates, presentation.displayedRouteCoordinates);
  const body = nodes(tree).find(n => n.props.testID === 'confirmed-request-content');
  assert.equal(nodes(body).some(n => n.type === 'Map'), false, 'map cannot be scrolled out of view');
  assert.match(text(tree), /Commande confirmée/);
  assert.match(text(body), /Départ.*Avenue de démonstration.*Destination.*Entrée test.*Prix du trajet.*8 500 FC.*Départ souhaité/s);
  assert.doesNotMatch(text(body), /au plus tard|Recherche d’un conducteur|Ce n’est pas une confirmation/);
  const footer = nodes(tree).find(n => n.props.testID === 'confirmed-request-actions');
  const change = nodes(footer).find(n => n.type === 'Change'); assert.equal(change.props.compact, true);
  assert.equal(change.props.booking, current.passengerBooking); assert.equal(change.props.trip, current.assignedTrip);
  nodes(footer).find(n => n.type === 'Button').props.onPress();
  nodes(tree).find(n => n.props.accessibilityLabel === 'Annuler la commande').props.onPress();
  assert.deepEqual(calls, ['preview-trip', 'cancel']);
  change.props.onPendingChange(true); tree = draw();
  assert.ok(nodes(tree).filter(n => n.type === 'Button' && n.props.accessibilityLabel !== 'Retour à l’accueil').every(n => n.props.disabled));
  current.passengerBooking = undefined;
  assert.equal(nodes(draw()).some(n => n.type === 'Change'), false, 'missing linked booking cannot enable changing');
});

test('driver identity and status never claim movement or show a stale ETA', () => {
  let state = { enabled: true, loading: false, pickup: null };
  const { RequestConfirmedDriver } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/request-detail/useConfirmedRequestPickup': { useConfirmedRequestPickup: () => state },
  })('features/request-detail/RequestConfirmedDriver.tsx');
  const draw = () => RequestConfirmedDriver({ request, active: true });
  for (const [patch, status] of [[{}, 'Estimation indisponible'], [{ enabled: false }, 'Hors connexion'],
    [{ loading: true }, 'Actualisation…'], [{ pickup: { status: 'waiting_location', person: { name: 'Alex M.' } } }, 'Position en attente']]) {
    state = { enabled: true, loading: false, pickup: null, ...patch };
    const content = text(draw()); assert.ok(content.includes(status));
    assert.match(content, /Alex M.*Toyota.*Corolla.*TEST-001/);
    assert.equal((content.match(/TEST-001/g) || []).length, 1); assert.doesNotMatch(content, /en route|arrive dans/);
  }
  state = { enabled: true, loading: false, pickup: { person: { name: 'Alex M.' }, time: '6 min', distance: '2,4 km' } };
  assert.match(text(draw()), /Approche estimée ≈ 6 min · 2,4 km/);
});

test('confirmed driver stops pickup estimates after boarding and shows the authoritative arrival', () => {
  const enabled = [];
  const { RequestConfirmedDriver } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/request-detail/useConfirmedRequestPickup': { useConfirmedRequestPickup: (_request, active) => {
      enabled.push(active); return { enabled: active, loading: false, pickup: null };
    } },
  })('features/request-detail/RequestConfirmedDriver.tsx');
  const picked = { pickedUp: true, pickedUpConfirmedByPassenger: false, pickupDetectionMethod: 'manual_driver_confirmation' };
  assert.match(text(RequestConfirmedDriver({ request, active: true, booking: picked })), /À bord · En route/);
  assert.equal(enabled.at(-1), false);
  assert.match(text(RequestConfirmedDriver({ request, active: true, booking: { ...picked, droppedOff: true } })), /Dépose confirmée/);
  assert.equal(enabled.at(-1), false);
});

test('confirmed summary stops hidden/offline polling and rejects stale, foreign or changed assignments', t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: Date.parse('2026-11-25T15:00:00Z') });
  const hooks = hookHarness(); t.after(() => hooks.unmount());
  let online = true, userId = request.passengerId, error = false; const options = [];
  const now = Date.now();
  let data = { requestId: request.id, tripId: request.tripId, viewerRole: 'passenger',
    driver: { id: request.selectedDriverId, name: request.selectedDriverName, position: { latitude: -4.3, longitude: 15.3, updatedAt: new Date(now).toISOString() } },
    passenger: { id: userId }, pickup: { location: 'Départ test', coordinates: null }, status: 'estimated',
    estimate: { distanceMeters: 1200, durationSeconds: 300 }, generatedAt: new Date(now).toISOString(), expiresAt: new Date(now + 30000).toISOString() };
  const { useConfirmedRequestPickup } = loader({ react: hooks.react,
    '@/store/hooks': { useAppSelector: fn => fn({ auth: { user: { id: userId } } }) },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: active => active && online, displayReadOptions: (enabled, poll) => ({ skip: !enabled, pollingInterval: enabled ? poll : 0 }) },
    '@/store/api/requestPickupApi': { useGetRequestPickupSummaryQuery: (_id, opts) => { options.push(opts); return { currentData: data, isError: error, fulfilledTimeStamp: now }; } },
  })('hooks/request-detail/useConfirmedRequestPickup.ts');
  const draw = (active = true) => hooks.render(() => useConfirmedRequestPickup(request, active));
  assert.equal(draw().pickup.time, '5 min'); assert.equal(options.at(-1).pollingInterval, 30000);
  assert.equal(draw(false).pickup, null); assert.equal(options.at(-1).pollingInterval, 0);
  online = false; assert.equal(draw().pickup, null); online = true;
  userId = 'foreign'; assert.equal(draw().pickup, null); userId = request.passengerId;
  error = true; assert.equal(draw().pickup, null); error = false;
  const valid = data;
  data = { ...valid, driver: { ...valid.driver, id: 'other-driver' } }; assert.equal(draw().pickup, null);
  data = { ...valid, tripId: 'another-trip' }; assert.equal(draw().pickup, null);
  data = { ...valid, driver: { ...valid.driver, position: { ...valid.driver.position, updatedAt: new Date(now - 121000).toISOString() } } };
  assert.equal(draw().pickup.time, null);
  data = valid; t.mock.timers.tick(30001); assert.equal(draw().pickup, null);
});
