const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { loader } = require('./helpers/loadTypeScript.cjs');

const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes)
  : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree)
  : Array.isArray(tree) ? tree.map(words).join('') : words(tree?.props?.children ?? '');

async function fixture(t, platform) {
  const previous = { window: globalThis.window, act: globalThis.IS_REACT_ACT_ENVIRONMENT };
  const doc = { nodeType: 9, addEventListener() {}, removeEventListener() {}, activeElement: null };
  doc.defaultView = { document: doc, HTMLIFrameElement: class {} };
  globalThis.window = doc.defaultView; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = { nodeType: 1, tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: doc, firstChild: null, addEventListener() {}, removeEventListener() {} };
  let renders = 0, nativePresentations = 0, accepted = 0, dismissed = 0, ignored = 0;
  const car = { id: 'car', brand: 'Toyota', model: 'Corolla', licensePlate: 'TEST' };
  const decision = { visible: true, canAccept: true, isIdentityVerified: true, available: true,
    vehicles: [car], vehicle: car, error: '', loading: false, busy: false, readError: false,
    order: { id: 'request', passengerName: 'Passager test', departure: { name: 'Gombe' }, arrival: { name: 'Lemba' },
      maxPricePerSeat: 2500, numberOfSeats: 2, departureDateMin: '2026-11-10T15:00:00Z', departureDateMax: '2026-11-10T15:30:00Z' },
    close: () => { ignored++; decision.visible = false; }, accept: async () => { accepted++; },
    openDetails() {}, selectVehicle() {}, retry() {}, onDismiss: () => dismissed++ };
  const load = loader({ react: React,
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
      Platform: { OS: platform }, StyleSheet: { create: value => value, absoluteFillObject: {} },
      Modal: () => { nativePresentations++; return null; } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 44, bottom: 34 }) },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    './RideNoticeBanner': { RideNoticeBanner: () => null },
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
    '@/hooks/home/useHomeRequestDecision': { useHomeRequestDecision: () => { renders++; return decision; } },
  });
  const { HomeRequestModal } = load('components/home/HomeRequestModal.tsx');
  const { RideOverlayContext } = load('features/navigation/rideOverlayContext.ts');
  const store = load('features/navigation/rideOverlayStore.ts').createRideOverlayStore();
  const root = createRoot(container);
  t.after(async () => {
    try { await React.act(async () => root.unmount()); }
    finally { globalThis.window = previous.window; globalThis.IS_REACT_ACT_ENVIRONMENT = previous.act; }
  });
  return { store, decision, stats: () => ({ renders, nativePresentations, accepted, dismissed, ignored }),
    render: (host = store, modalProps = {}) => React.act(async () => root.render(
      React.createElement(RideOverlayContext.Provider, { value: host },
        React.createElement(React.StrictMode, null, React.createElement(HomeRequestModal, { enabled: true, ...modalProps }))))),
    tree: () => store.getEntries()[0]?.children,
  };
}

for (const os of ['ios', 'android']) test(`${os}: real React StrictMode uses one in-app overlay, no UIKit/native modal and no render feedback loop`, async t => {
  const f = await fixture(t, os); await f.render();
  assert.equal(f.store.getEntries().length, 1); assert.equal(f.stats().nativePresentations, 0);
  assert.match(words(f.tree()), /Nouvelle commande.*Gombe.*Lemba/);
  assert.match(words(f.tree()), /5.?000.*pour le trajet/); assert.doesNotMatch(words(f.tree()), /par place/);
  const buttons = nodes(f.tree()).filter(node => node.type === 'Button');
  assert.ok(buttons.some(node => words(node) === 'Ignorer'));
  assert.ok(buttons.some(node => words(node) === 'Accepter' && !node.props.disabled));
  for (let i = 0; i < 20; i++) {
    const before = f.stats().renders; f.decision.order = { ...f.decision.order }; await f.render();
    assert.ok(f.stats().renders - before <= 2, 'fresh JSX must not recursively republish the store');
    assert.equal(f.store.getEntries().length, 1);
  }
  const scroll = nodes(f.tree()).find(node => node.type === 'Scroll');
  assert.ok(scroll); assert.ok(!nodes(scroll).some(node => words(node) === 'Ignorer'), 'actions stay outside scrollable content');
  buttons.find(node => words(node) === 'Ignorer').props.onPress(); await f.render();
  assert.equal(f.store.getEntries().length, 0); assert.equal(f.stats().dismissed, 1);
  assert.equal(f.stats().accepted, 0); assert.equal(f.stats().nativePresentations, 0);
});

test('compact vehicle summary expands inline; references stay attached to each endpoint', async t => {
  const f = await fixture(t, 'ios');
  f.decision.order.departure.reference = 'Devant la pharmacie';
  f.decision.order.arrival.reference = 'Portail bleu';
  f.decision.vehicles.push({ id: 'second', brand: 'Honda', model: 'Civic', licensePlate: 'TEST2' });
  f.decision.selectVehicle = id => { f.decision.vehicle = f.decision.vehicles.find(car => car.id === id); };
  await f.render();
  assert.match(words(f.tree()), /GombeDevant la pharmacie.*LembaPortail bleu/);
  assert.doesNotMatch(words(f.tree()), /Un passager vous attend|Choisissez votre véhicule/);
  assert.equal(nodes(f.tree()).filter(node => node.props.accessibilityRole === 'radio').length, 0);
  await React.act(async () => nodes(f.tree()).find(node => node.props.accessibilityLabel?.startsWith('Votre véhicule')).props.onPress());
  assert.equal(nodes(f.tree()).filter(node => node.props.accessibilityRole === 'radio').length, 2);
  await React.act(async () => nodes(f.tree()).find(node => node.props.accessibilityRole === 'radio' && words(node).includes('Honda')).props.onPress());
  assert.equal(f.decision.vehicle.id, 'second');
  assert.equal(nodes(f.tree()).filter(node => node.props.accessibilityRole === 'radio').length, 0);
  assert.equal(f.stats().nativePresentations, 0);
});

test('iOS: payment/SOS/native dismissal blockers retain priority without stacking controllers', async t => {
  const f = await fixture(t, 'ios'); await f.render(); const command = f.store.getActive().id;
  for (const priority of [70, 100]) {
    f.store.put({ id: 'urgent', scope: 'global', priority, children: 'urgent' });
    await f.render(); assert.equal(f.store.getActive().id, 'urgent');
    f.store.remove('urgent'); assert.equal(f.store.getActive().id, command);
  }
  f.store.blockNative('existing-native-dismissal', true); await f.render(); assert.equal(f.store.getActive(), null);
  f.store.blockNative('existing-native-dismissal', false); assert.equal(f.store.getActive().id, command);
  assert.equal(f.stats().nativePresentations, 0);
});

test('post-trip modal yields to the existing end-of-trip summary and payment without another native presentation', async t => {
  const f = await fixture(t, 'ios'); await f.render(f.store, { priority: 10 });
  const command = f.store.getActive().id;
  assert.equal(f.store.getActive().priority, 10);
  for (const priority of [30, 70, 100]) {
    f.store.put({ id: 'existing', scope: 'global', priority, children: 'summary/payment/SOS' });
    await f.render(f.store, { priority: 10 });
    assert.equal(f.store.getActive().id, 'existing');
    f.store.remove('existing'); assert.equal(f.store.getActive().id, command);
  }
  assert.equal(f.stats().nativePresentations, 0);
});

test('iOS: missing shared host never falls back to a native modal; repeated focus cycles clean up', async t => {
  const f = await fixture(t, 'ios'); await f.render(null);
  assert.equal(f.stats().nativePresentations, 0); assert.equal(f.store.getEntries().length, 0);
  for (let i = 0; i < 20; i++) {
    f.decision.visible = true; await f.render(); assert.equal(f.store.getEntries().length, 1);
    f.decision.visible = false; await f.render(); assert.equal(f.store.getEntries().length, 0);
  }
  assert.equal(f.stats().nativePresentations, 0);
});

test('loading, retry, choice and acceptance states provide one clear action without a nested chooser modal', async t => {
  const f = await fixture(t, 'ios'); f.decision.loading = true; f.decision.canAccept = false; await f.render();
  assert.match(words(f.tree()), /Chargement/);
  assert.equal(nodes(f.tree()).find(node => node.type === 'Button' && words(node) === 'Accepter').props.disabled, true);
  f.decision.readError = true; await f.render(); assert.match(words(f.tree()), /Réessayer/);
  f.decision.readError = false; f.decision.loading = false;
  f.decision.vehicles = [f.decision.vehicle, { id: 'other', brand: 'Honda', model: 'Civic', licensePlate: 'TEST2' }];
  f.decision.vehicle = null; await f.render(); assert.match(words(f.tree()), /Choisissez votre véhicule/);
  assert.equal(nodes(f.tree()).filter(node => node.props.accessibilityRole === 'radio').length, 2);
  f.decision.busy = true; await f.render(); assert.match(words(f.tree()), /Acceptation…/);
  assert.equal(nodes(f.tree()).find(node => node.type === 'Button' && words(node) === 'Ignorer').props.disabled, true);
  assert.equal(f.stats().nativePresentations, 0);
});
