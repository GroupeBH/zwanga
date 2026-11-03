const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

// Unlike snapshot-only hook mocks, this models subscribe + Object.is + the
// resulting parent render. Native/React rendering is NOT exercised by this harness.
function fixture(t, platform) {
  const hooks = hookHarness('decision');
  let dirty = false, renders = 0, subscriptions = 0;
  const react = { ...React, ...hooks.react,
    createContext: value => ({ value }), useContext: context => context.value,
    useSyncExternalStore(subscribe, getSnapshot) {
      const snapshot = getSnapshot();
      const current = hooks.react.useRef({ snapshot, getSnapshot });
      current.current = { snapshot, getSnapshot };
      hooks.react.useEffect(() => {
        const check = () => {
          if (!Object.is(current.current.snapshot, current.current.getSnapshot())) dirty = true;
        };
        subscriptions++;
        const unsubscribe = subscribe(check); check();
        return () => { subscriptions--; unsubscribe(); };
      }, [subscribe]);
      return snapshot;
    },
  };
  const io = { active: true, panel: false, revision: 0, shown: 0, closed: 0, locationSubscriptions: 0 };
  const load = loader({ react,
    'react-native': { Platform: { OS: platform }, Modal: 'NativeModal', View: 'View',
      StyleSheet: { create: value => value, absoluteFillObject: {} } },
    './RideNoticeBanner': { RideNoticeBanner: 'Notice' },
    '@/hooks/useAppIsActive': { useAppIsActive: () => io.active },
    '@/hooks/passenger-navigation/useDriverLocationFallback': { useDriverLocationFallback: () => undefined },
    '@/services/appActivity': { isAppActive: () => io.active },
    '@/services/trackingSocket': { trackingSocket: {
      subscribeToDriverLocation: () => { io.locationSubscriptions++; return () => io.locationSubscriptions--; },
      subscribeToBookingAutoProgress: () => () => {},
    } },
  });
  const store = load('features/navigation/rideOverlayStore.ts').createRideOverlayStore();
  load('features/navigation/rideOverlayContext.ts').RideOverlayContext.value = store;
  const { RideModal } = load('features/navigation/RideModal.tsx');
  const { usePassengerApproachAnnouncement } = load('hooks/notifications/usePassengerApproachAnnouncement.ts');
  const speech = load('services/paymentSpeechSource.ts');
  const props = { userId: 'passenger', isScreenActive: true,
    trip: { id: 'trip', driverId: 'driver', status: 'ongoing', departure: { lat: -4.3, lng: 15.3 } },
    booking: { id: 'booking', passengerId: 'passenger', tripId: 'trip', status: 'accepted' } };
  const flush = () => {
    const start = renders;
    dirty = true;
    while (dirty) {
      if (renders - start >= 12) throw new Error('Overlay publication keeps scheduling the passenger screen');
      dirty = false; renders++;
      hooks.render(() => {
        usePassengerApproachAnnouncement(props);
        // A real screen recreates its JSX/callbacks on each render. Do not memoize
        // this fixture: that would hide the production feedback cycle.
        return RideModal({ inApp: true, visible: io.panel,
          children: React.createElement('View', { revision: io.revision }),
          onShow: () => { io.shown++; }, onRequestClose: () => { io.closed++; io.panel = false; } });
      });
    }
    return renders - start;
  };
  let disposed = false;
  const unmount = () => { if (!disposed) { disposed = true; hooks.unmount(); } };
  t.after(unmount);
  return { io, props, store, flush, unmount, readSpeech: () => speech.readPaymentSpeech('passenger', 0),
    subscriptions: () => subscriptions };
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: passenger approach and a screen-owned panel converge instead of republishing forever`, t => {
    const f = fixture(t, platform);
    assert.equal(f.flush(), 1); assert.equal(f.readSpeech().kind, 'approach');
    f.io.panel = true;
    assert.ok(f.flush() <= 2, 'only closed -> open requires another parent render');
    assert.equal(f.readSpeech(), undefined, 'voice yields to the panel');
    for (let i = 0; i < 30; i++) {
      f.io.revision++;
      assert.equal(f.flush(), 1, 'changed panel content must not schedule the parent again');
      assert.equal(f.store.getActive().children.props.revision, f.io.revision, 'content updates are NOT discarded');
    }
    f.store.getActive().onShow(); assert.equal(f.io.shown, 1);
    f.store.getActive().onRequestClose(); assert.ok(f.flush() <= 2);
    assert.equal(f.io.closed, 1); assert.equal(f.store.getActive(), null); assert.equal(f.readSpeech().kind, 'approach');
    assert.equal(f.io.locationSubscriptions, 1, 'panel content updates do not reconnect tracking');
    f.unmount(); assert.equal(f.subscriptions(), 0); assert.equal(f.io.locationSubscriptions, 0);
    assert.equal(f.store.getEntries().length, 0); assert.equal(f.readSpeech(), undefined);
  });

  test(`${platform}: overlapping SOS/payment panels keep approach speech blocked and clean up on background`, t => {
    const f = fixture(t, platform); f.io.panel = true; f.flush();
    f.store.put({ id: 'payment', scope: 'global', priority: 70, children: 'payment' });
    assert.equal(f.flush(), 1); assert.equal(f.store.getActive().id, 'payment'); assert.equal(f.readSpeech(), undefined);
    f.store.put({ id: 'sos', scope: 'global', priority: 100, children: 'sos' });
    assert.equal(f.flush(), 1); assert.equal(f.store.getActive().id, 'sos');
    f.io.panel = false; assert.equal(f.flush(), 1); assert.equal(f.readSpeech(), undefined);
    f.store.remove('sos'); f.flush(); assert.equal(f.readSpeech(), undefined);
    f.store.remove('payment'); f.flush(); assert.equal(f.readSpeech().kind, 'approach');
    f.io.active = false; f.flush(); assert.equal(f.readSpeech(), undefined); assert.equal(f.io.locationSubscriptions, 0);
    f.io.active = true; f.io.panel = true; assert.ok(f.flush() <= 2); assert.equal(f.readSpeech(), undefined);
  });
}
