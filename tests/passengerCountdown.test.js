const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('passenger countdown pauses offscreen, resumes against wall clock and stops at zero', t => {
  // Node 20's experimental MockTimers re-enqueues an interval cleared inside its
  // own callback. Keep cancellation explicit so this also tests the EAS runtime.
  let now = 100_000, nextId = 1;
  const intervals = new Map();
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'setInterval', (callback, delay) => {
    assert.equal(delay, 1000);
    const id = nextId++;
    intervals.set(id, { callback, delay, next: now + delay });
    return id;
  });
  t.mock.method(globalThis, 'clearInterval', id => intervals.delete(id));
  const tick = milliseconds => {
    const end = now + milliseconds;
    while (true) {
      const timer = [...intervals.values()].sort((a, b) => a.next - b.next)[0];
      if (!timer || timer.next > end) break;
      now = timer.next;
      timer.next += timer.delay;
      timer.callback();
    }
    now = end;
  };
  const hooks = hookHarness(), values = [];
  const { usePassengerTripDestinationNotice } = loader({ react: hooks.react,
    '@/utils/navigationSpeech': { NavigationSpeech: {} },
  })('hooks/passenger-navigation/usePassengerTripDestinationNotice.ts');
  const refs = Object.fromEntries(['isMountedRef', 'hasPresentedTripCompletedNoticeRef',
    'hasPresentedTripDestinationApproachNoticeRef', 'hasPresentedArrivalModalRef',
    'hasDisplayedDriverNearNotificationRef', 'hasPresentedBoardedNoticeRef',
    'hasPresentedDestinationApproachNoticeRef', 'hasPresentedNoShowNoticeRef',
    'hasPresentedBoardingUncertainNoticeRef', 'hasObservedPickupStateRef', 'previousPickupStateRef',
    'lastAcceptedDriverCoordinateRef', 'lastAcceptedDriverTimestampRef', 'lastAcceptedPassengerCoordinateRef',
    'lastAcceptedPassengerTimestampRef', 'routeSignatureRef', 'routeFetchedRef', 'lastRouteFetchRef']
    .map(key => [key, { current: null }]));
  const params = { ...refs, isScreenActive: true, bookingId: 'booking', booking: undefined,
    presentedPickupNoticeKeysRef: { current: new Set() }, highestPickupNoticePriorityRef: { current: new Map() },
    setPickupNotice() {}, showDialog() {}, presentBoardedNotice() {},
    pickupNotice: { expiresAt: new Date(110_000).toISOString() }, setPickupNoticeCountdown: value => values.push(value) };
  const render = () => hooks.render(() => usePassengerTripDestinationNotice(params));
  t.after(() => hooks.unmount());
  render(); assert.equal(intervals.size, 1);
  tick(1000); assert.equal(values.at(-1), 9);
  params.isScreenActive = false; render(); const hiddenCount = values.length;
  assert.equal(intervals.size, 0);
  tick(5000); assert.equal(values.length, hiddenCount);
  params.isScreenActive = true; render(); assert.equal(values.at(-1), 4);
  assert.equal(intervals.size, 1);
  tick(4000); assert.equal(values.at(-1), 0);
  assert.equal(intervals.size, 0);
  const expiredCount = values.length;
  tick(60_000); assert.equal(values.length, expiredCount);
  params.pickupNotice = { expiresAt: 'invalid' }; render(); assert.equal(values.at(-1), null);
  assert.equal(intervals.size, 0);
  params.pickupNotice = { expiresAt: new Date(now - 1000).toISOString() }; render();
  assert.equal(values.at(-1), 0); assert.equal(intervals.size, 0);
  params.pickupNotice = { expiresAt: new Date(now + 30_000).toISOString() }; render();
  assert.equal(intervals.size, 1);
  hooks.unmount(); assert.equal(intervals.size, 0);
  const unmountedCount = values.length;
  tick(60_000); assert.equal(values.length, unmountedCount);
});
