const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { loader } = require('./helpers/loadTypeScript.cjs');

// Real React 19 effects/subscriptions/reconciler, but no native rendering or DOM
// content: RideModal(inApp) publishes its children to the store and returns null.
function emptyContainer() {
  const document = { nodeType: 9, addEventListener() {}, removeEventListener() {}, activeElement: null };
  document.defaultView = { document, HTMLIFrameElement: class {} };
  return { nodeType: 1, tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: document, firstChild: null, addEventListener() {}, removeEventListener() {} };
}

async function fixture(t, platform, legacy = false) {
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const previousWindow = globalThis.window;
  const container = emptyContainer();
  globalThis.window = container.ownerDocument.defaultView;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let provider, renders = 0, locationSubscriptions = 0;
  const load = loader({ react: React,
    ...(legacy ? { '@/features/navigation/RideOverlayProvider': {
      // Original behavior: subscribe to the entire entry, then convert to boolean.
      useHasRideOverlay: () => Boolean(provider.useRideOverlay().active),
    } } : {}),
    'react-native': { Platform: { OS: platform }, Modal: () => null, View: () => null,
      StyleSheet: { create: value => value, absoluteFillObject: {} } },
    './RideNoticeBanner': { RideNoticeBanner: () => null },
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
    '@/hooks/passenger-navigation/useDriverLocationFallback': { useDriverLocationFallback: () => undefined },
    '@/services/appActivity': { isAppActive: () => true },
    '@/services/trackingSocket': { trackingSocket: {
      subscribeToDriverLocation: () => { locationSubscriptions++; return () => locationSubscriptions--; },
      subscribeToBookingAutoProgress: () => () => {},
    } },
  });
  provider = load('features/navigation/RideOverlayProvider.tsx');
  const { RideOverlayContext } = load('features/navigation/rideOverlayContext.ts');
  const store = load('features/navigation/rideOverlayStore.ts').createRideOverlayStore();
  const { RideModal } = load('features/navigation/RideModal.tsx');
  const { usePassengerApproachAnnouncement } = load('hooks/notifications/usePassengerApproachAnnouncement.ts');
  const props = { userId: 'passenger', isScreenActive: true,
    trip: { id: 'trip', driverId: 'driver', status: 'ongoing', departure: { lat: -4.3, lng: 15.3 } },
    booking: { id: 'booking', passengerId: 'passenger', tripId: 'trip', status: 'accepted' } };
  function PassengerScreen({ visible, value }) {
    renders++;
    usePassengerApproachAnnouncement(props);
    return React.createElement(RideModal, { inApp: true, visible }, React.createElement('div', { value }));
  }
  const root = createRoot(container);
  t.after(async () => {
    try { await React.act(async () => root.unmount()); }
    finally {
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
      globalThis.window = previousWindow;
    }
  });
  return { store, subscriptions: () => locationSubscriptions, renders: () => renders,
    render: (visible, value = 0) => React.act(async () => root.render(
      React.createElement(RideOverlayContext.Provider, { value: store },
        React.createElement(React.StrictMode, null, React.createElement(PassengerScreen, { visible, value }))))),
  };
}

test('real React detects the original object-snapshot feedback cycle', async t => {
  const f = await fixture(t, 'android', true);
  await assert.rejects(async () => { await f.render(true); }, /Maximum update depth exceeded/);
});

for (const platform of ['android', 'ios']) test(`${platform}: real React StrictMode opens, updates and closes a passenger panel without a render loop`, async t => {
  const f = await fixture(t, platform);
  await f.render(false);
  const before = f.renders(); await f.render(true);
  assert.ok(f.renders() - before <= 6);
  assert.equal(f.store.getActive().children.props.value, 0);
  assert.equal(f.subscriptions(), 1);
  for (let i = 1; i <= 10; i++) {
    const previous = f.renders(); await f.render(true, i);
    assert.ok(f.renders() - previous <= 2, 'StrictMode renders twice, not once per store notification');
    assert.equal(f.store.getActive().children.props.value, i);
  }
  await f.render(false); assert.equal(f.store.getEntries().length, 0);
  await f.render(true, 11); assert.equal(f.store.getActive().children.props.value, 11);
  assert.equal(f.subscriptions(), 1, 'modal updates do not reconnect driver tracking');
});
