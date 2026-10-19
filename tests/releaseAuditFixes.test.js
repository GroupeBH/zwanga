const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const luminance = color => color.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
  .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
  .reduce((total, value, i) => total + value * [0.2126, 0.7152, 0.0722][i], 0);

test('driver actions are blue/green/orange and shared filled actions have readable white labels', () => {
  const load = loader({ 'react-native': { StyleSheet: { create: x => x } } });
  const { ACTION_COLORS: colors } = load('constants/actionColors.ts');
  const { styles } = load('features/home/HomeTripsSheet.styles.ts');
  assert.equal(styles.publishButton.backgroundColor, colors.blue);
  assert.equal(styles.driverSearchButton.backgroundColor, colors.green);
  assert.equal(styles.driverOrderButton.backgroundColor, colors.orange);
  for (const color of Object.values(colors)) assert.ok(1.05 / (luminance(color) + 0.05) >= 4.5);
  for (const label of ['publishButtonText', 'driverSearchText', 'driverOrderText']) assert.equal(styles[label].color, '#FFFFFF');
  const summary = load('features/request-detail/requestSummaryStyles.ts').requestSummaryStyles;
  assert.equal(summary.primary.backgroundColor, colors.orange);
  assert.equal(load('constants/styles.ts').CommonStyles.buttonPrimary.backgroundColor, colors.orange);
});

test('entry status is inline before home actions, with no native overlay or change to map geometry', () => {
  let status = null;
  const load = loader({ react: { ...React, useContext: () => status },
    './EntrySyncBanner': { EntrySyncBanner: 'Banner' } });
  const { HomeEntryStatus } = load('components/home/HomeEntryStatus.tsx');
  assert.equal(HomeEntryStatus(), null);
  status = { failed: false, offline: false, actionLabel: 'Reprendre mon trajet', onAction() {} };
  assert.equal(HomeEntryStatus().props.onAction, status.onAction);
  const source = fs.readFileSync('components/home/HomeTripsSheet.tsx', 'utf8');
  assert.ok(source.indexOf('<HomeEntryStatus />') > source.indexOf('<ScrollView'));
  assert.ok(source.indexOf('<HomeEntryStatus />') < source.indexOf('<View style={styles.greetingRow}'));
  const banner = fs.readFileSync('components/home/EntrySyncBanner.tsx', 'utf8');
  assert.doesNotMatch(banner, /position:\s*'absolute'|zIndex|elevation/);
});

test('main-screen telemetry waits for layout, uncovered UI and focus; cancelled callbacks are harmless', () => {
  const h = hookHarness(), tasks = [], reported = []; let covered = true;
  const { useMainScreenReady } = loader({ react: h.react,
    'react-native': { InteractionManager: { runAfterInteractions: fn => { const task = { fn, cancel() {} }; tasks.push(task); return task; } } },
    '@/features/navigation/appEntryContext': { useAppEntryPending: () => covered },
    '@/services/mainScreenReadiness': { reportMainScreenReady: screen => reported.push(screen) },
  })('hooks/useMainScreenReady.ts');
  const render = (active = true) => h.render(() => useMainScreenReady(active, 'home'));
  render(); assert.equal(tasks.length, 0);
  render()(); render(); assert.equal(tasks.length, 0);
  covered = false; render(); assert.equal(tasks.length, 1);
  render(false); tasks[0].fn(); assert.deepEqual(reported, []);
  render(true); tasks[1].fn(); assert.deepEqual(reported, ['home']);
  h.unmount();
});

test('main-screen telemetry reports once per JS startup without account or trip identifiers', async () => {
  const events = [];
  const { reportMainScreenReady } = loader({ './analytics': { trackEvent: async (...args) => events.push(args) },
    './diagnostics': { getStartupElapsedMs: () => 1234 } })('services/mainScreenReadiness.ts');
  reportMainScreenReady('driver_navigation'); reportMainScreenReady('home');
  assert.deepEqual(events, [['app_main_screen_ready', { elapsed_ms: 1234, screen: 'driver_navigation' }]]);
});

test('release gate fails closed and both production builds depend on it', () => {
  const { runGate, testFiles } = require('../scripts/check-release.cjs');
  assert.ok(testFiles().length >= 262);
  for (const failure of [{ status: 1 }, { status: null, signal: 'SIGTERM' }, { error: Error('spawn') }]) {
    let count = 0;
    assert.equal(runGate(() => { count++; return failure; }), 1); assert.equal(count, 1);
  }
  const commands = [];
  assert.equal(runGate((_bin, args) => { commands.push(args); return { status: 0 }; }), 0);
  assert.ok(commands.some(args => args.includes('--test')));
  const workflow = require('yaml').parse(fs.readFileSync('.eas/workflows/create-production-builds.yml', 'utf8'));
  for (const job of ['build_android', 'build_ios']) assert.deepEqual(workflow.jobs[job].needs, ['quality']);
  assert.equal(workflow.jobs.quality.steps.at(-1).run, 'npm run check:release');
});

test('a native failure in a background notification action cannot reject the headless callback', async () => {
  let handler;
  loader({ 'react-native': { Linking: { openURL: async () => { throw Error('native'); } } },
    './ongoingTripNotification': { ONGOING_TRIP_NOTIFICATION_ID: 'ongoing' },
    './driverNotificationResponse': { respondToDriverNotification: async () => { throw Error('network'); } },
    './driverNotifications': { dismissDriverInvitation: async () => { throw Error('storage'); } },
    '@/features/notifications/rideSound': { parseNearbyPhoneAlert: () => ({ id: 'synthetic' }) },
    '@notifee/react-native': { default: { onBackgroundEvent: fn => { handler = fn; } }, EventType: { PRESS: 1, ACTION_PRESS: 2 } },
  })('services/notifeeBackgroundHandler.ts');
  await assert.doesNotReject(() => handler({ type: 2, detail: { notification: { data: {} }, pressAction: { id: 'driver-ignore-nearby' } } }));
  await assert.doesNotReject(() => handler({ type: 1, detail: { notification: { data: {} } } }));
  await assert.doesNotReject(() => handler({ type: 1, detail: null }));
});
