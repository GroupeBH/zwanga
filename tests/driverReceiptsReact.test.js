const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { createRoot } = require('react-dom/client');
const { loader } = require('./helpers/loadTypeScript.cjs');

// Real React effects and external-store subscriptions, no native rendering.
for (const platform of ['android', 'ios']) test(`${platform}: actual driver receipts open, update and close without recursive rendering`, async () => {
  const previousWindow = globalThis.window, previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  const doc = { nodeType: 9, addEventListener() {}, removeEventListener() {}, activeElement: null };
  doc.defaultView = { document: doc, HTMLIFrameElement: class {} };
  const container = { nodeType: 1, tagName: 'DIV', namespaceURI: 'http://www.w3.org/1999/xhtml',
    ownerDocument: doc, firstChild: null, addEventListener() {}, removeEventListener() {} };
  globalThis.window = doc.defaultView; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let press, renders = 0;
  const Null = () => null, Pass = props => props.children;
  const load = loader({ react: React,
    'react-native': { Platform: { OS: platform }, View: Pass, Text: Null, Modal: Null,
      TouchableOpacity: props => { renders++; press = props.onPress; return null; },
      StyleSheet: { create: value => value, hairlineWidth: 1, absoluteFillObject: {} } },
    '@/components/home/SwipeableHomePriority': { SwipeableHomePriority: Pass },
    '@/features/driver-payments/DriverBookingRevenue': { DriverBookingRevenue: Null },
    '@expo/vector-icons': { Ionicons: Null },
    './DriverDropoffReceiptsSheet': { DriverDropoffReceiptsSheet: Null },
    './RideNoticeBanner': { RideNoticeBanner: Null },
    '@/hooks/useAppIsActive': { useAppIsActive: () => true },
  });
  const { DriverDropoffReceipts } = load('features/driver-navigation/DriverDropoffReceipts.tsx');
  const { RideOverlayContext } = load('features/navigation/rideOverlayContext.ts');
  const store = load('features/navigation/rideOverlayStore.ts').createRideOverlayStore();
  const root = createRoot(container);
  const props = { active: true, tripId: 'test-trip', bookings: [{ id: 'test-booking', tripId: 'test-trip', status: 'completed', updatedAt: '2026-11-03T10:00:00Z' }] };
  const render = () => React.act(async () => root.render(React.createElement(RideOverlayContext.Provider, { value: store },
    React.createElement(React.StrictMode, null, React.createElement(DriverDropoffReceipts, props)))));
  try {
    await render(); assert.equal(typeof press, 'function');
    const before = renders;
    await React.act(async () => press());
    assert.equal(store.getEntries().length, 1); assert.ok(renders - before <= 6);
    for (let i = 0; i < 5; i++) {
      const previous = renders;
      props.bookings = [{ ...props.bookings[0], passengerName: `Test ${i}` }];
      await render(); assert.ok(renders - previous <= 2);
      assert.equal(store.getActive().children.props.bookings[0].passengerName, `Test ${i}`);
    }
    await React.act(async () => store.getActive().children.props.onClose());
    assert.equal(store.getEntries().length, 0);
    await React.act(async () => press()); assert.equal(store.getEntries().length, 1);
    props.active = false; await render(); assert.equal(store.getEntries().length, 0);
  } finally {
    await React.act(async () => root.unmount());
    globalThis.window = previousWindow; globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  }
});
