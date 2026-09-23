const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('passenger countdown pauses offscreen, resumes against wall clock and stops at zero', t => {
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: 100_000 });
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
  render(); t.mock.timers.tick(1000); assert.equal(values.at(-1), 9);
  params.isScreenActive = false; render(); const hiddenCount = values.length;
  t.mock.timers.tick(5000); assert.equal(values.length, hiddenCount);
  params.isScreenActive = true; render(); assert.equal(values.at(-1), 4);
  t.mock.timers.tick(4000); assert.equal(values.at(-1), 0);
  const expiredCount = values.length;
  t.mock.timers.tick(60_000); assert.equal(values.length, expiredCount);
  params.pickupNotice = { expiresAt: 'invalid' }; render(); assert.equal(values.at(-1), null);
  hooks.unmount();
});
