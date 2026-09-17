const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function environment(overrides = {}) {
  const hooks = hookHarness();
  const events = [], dialogs = [], mutations = [];
  let backHandler;
  const load = loader({
    react: hooks.react,
    'react-native': { Platform: { OS: 'ios' }, BackHandler: {
      addEventListener: (_name, callback) => { backHandler = callback; return { remove: () => { backHandler = null; } }; },
    } },
    '@/services/driverBackgroundLocationTask': { stopDriverBackgroundLocationTracking: async id => events.push(`stop-background:${id}`) },
    '@/utils/errorHelpers': { getApiErrorMessage: (_error, fallback) => fallback },
  });
  const { useDriverTripInterruptionActions } = load('hooks/driver-navigation/useDriverTripInterruptionActions.ts');
  const { useDriverTripActions } = load('hooks/driver-navigation/useDriverTripActions.ts');
  const { useDriverNavigationExitPrompt } = load('hooks/driver-navigation/useDriverNavigationExitPrompt.ts');
  const params = {
    tripId: 'trip-1', isScreenActive: true, isFocused: true, isExitingRef: { current: false },
    trip: { id: 'trip-1', status: 'ongoing' }, bookingsRef: { current: [] },
    pauseTrip: id => { mutations.push({ type: 'pause', id }); return { unwrap: async () => ({ status: 'upcoming' }) }; },
    requestDriverTripInterruption: body => { mutations.push({ type: 'request', body }); return { unwrap: async () => ({ status: 'ongoing' }) }; },
    reconcileTripStatus: async () => null,
    locationSubscription: { current: { remove: () => events.push('remove-location') } },
    currentLocationRef: { current: { coords: { latitude: -4.38, longitude: 15.32 } } },
    setIsSocketConnected: () => events.push('clear-socket-state'), setLivePassengerLocations: () => events.push('clear-passengers'),
    cleanupNavigationUi: () => events.push('cleanup'),
    navigateBackSafely: () => { events.push('exit'); params.isExitingRef.current = true; },
    refetchTrip: async () => events.push('read-trip'), refetchBookings: async () => events.push('read-bookings'),
    showDialog: dialog => dialogs.push(dialog), setSecurityModalVisible: () => events.push('close-security'),
    activeDriverInterruptionRequest: null,
    cancelDriverTripInterruption: id => { mutations.push({ type: 'cancel', id }); return { unwrap: async () => ({}) }; },
    ...overrides,
  };
  const render = () => hooks.render(() => {
    const interruption = useDriverTripInterruptionActions(params);
    const handleExitNavigation = useDriverNavigationExitPrompt({
      status: params.trip?.status, interruptionPending: Boolean(params.activeDriverInterruptionRequest),
      navigateBackSafely: params.navigateBackSafely, showDialog: params.showDialog,
    });
    const actions = useDriverTripActions({ ...params, ...interruption, handleExitNavigation });
    return { ...interruption, ...actions, handleExitNavigation };
  });
  return { params, render, events, dialogs, mutations, unmount: hooks.unmount, hardwareBack: () => backHandler?.() };
}

test('without onboard passengers: one confirmation pauses and leaves, with no success/exit popup', async () => {
  const app = environment();
  app.render().handlePauseTripFromNavigation();
  assert.equal(app.mutations.length, 0, 'opening the confirmation is not consent to interrupt');
  assert.equal(app.dialogs.length, 1);
  const dialog = app.dialogs[0];
  assert.match(dialog.message, /gestion/);
  assert.equal(dialog.actions.find(a => a.label === 'Annuler').onPress, undefined);
  const interruptAction = dialog.actions.find(a => a.label === 'Interrompre et quitter');
  assert.equal(interruptAction.variant, 'danger', 'the interruption action uses the red danger style');
  await interruptAction.onPress();
  assert.deepEqual(app.mutations, [{ type: 'pause', id: 'trip-1' }]);
  assert.equal(app.dialogs.length, 1);
  assert.equal(app.events.filter(e => e === 'exit').length, 1);
  assert.ok(app.events.includes('stop-background:trip-1'));
  assert.ok(app.events.indexOf('cleanup') < app.events.indexOf('exit'));
  assert.equal(app.params.currentLocationRef.current, null);
  app.unmount();
});

for (const [label, reason] of [['Urgence', 'emergency'], ['Autre raison', 'other']]) {
  test(`with onboard passengers: ${label} requests approval then exits without pausing the trip`, async () => {
    const app = environment({ bookingsRef: { current: [{ status: 'accepted', pickedUp: true }] } });
    app.render().handlePauseTripFromNavigation();
    const dialog = app.dialogs[0];
    assert.match(dialog.message, /confirmation de tous les passagers/);
    assert.match(dialog.message, /quitter la navigation/);
    await dialog.actions.find(a => a.label === label).onPress();
    assert.equal(app.mutations.length, 1);
    assert.equal(app.mutations[0].type, 'request');
    assert.equal(app.mutations[0].body.reason, reason);
    assert.deepEqual(app.mutations[0].body.coordinates, { latitude: -4.38, longitude: 15.32 });
    assert.equal(app.dialogs.length, 1);
    assert.ok(app.events.includes('exit'));
    assert.ok(!app.events.some(e => e.startsWith('stop-background')));
    app.unmount();
  });
}

test('a server-confirmed interruption in the request response does stop background tracking', async () => {
  const app = environment({ requestDriverTripInterruption: () => ({ unwrap: async () => ({ status: 'upcoming' }) }) });
  await app.render().sendDriverInterruptionRequest('emergency');
  assert.ok(app.events.includes('stop-background:trip-1'));
  assert.ok(app.events.includes('exit'));
  app.unmount();
});

test('slow or failed follow-up reads cannot hold the exit or display a false mutation failure', async () => {
  const slowRead = deferred();
  const app = environment({ refetchTrip: () => slowRead.promise, refetchBookings: async () => { throw Error('offline'); } });
  await app.render().sendDriverInterruptionRequest('other');
  assert.ok(app.events.includes('exit'));
  assert.equal(app.dialogs.length, 0);
  slowRead.reject(Error('timeout'));
  await Promise.resolve();
  app.unmount();
});

for (const method of ['pauseTripWithoutPassengerConfirmation', 'sendDriverInterruptionRequest']) {
  test(`${method}: failed mutation keeps navigation and allows a later retry`, async () => {
    const fail = () => ({ unwrap: async () => { throw Error('offline'); } });
    const app = environment({ pauseTrip: fail, requestDriverTripInterruption: fail });
    const action = app.render()[method];
    await action('emergency');
    assert.equal(app.events.length, 0);
    assert.equal(app.dialogs.length, 1);
    assert.equal(app.dialogs[0].variant, 'danger');
    await action('emergency');
    assert.equal(app.dialogs.length, 2, 'the in-flight lock is released on failure');
    app.unmount();
  });
}

test('an ambiguous pause exits only after the server snapshot confirms it', async () => {
  let reconciliations = 0;
  const app = environment({
    pauseTrip: () => ({ unwrap: async () => { throw Error('timeout'); } }),
    reconcileTripStatus: async (_error, statuses) => { reconciliations++; assert.deepEqual(statuses, ['upcoming']); return { status: 'upcoming' }; },
  });
  await app.render().pauseTripWithoutPassengerConfirmation();
  assert.equal(reconciliations, 1);
  assert.ok(app.events.includes('exit'));
  assert.equal(app.dialogs.length, 0);
  app.unmount();
});

test('double taps share a single in-flight action and cannot send both pause and request', async () => {
  const pending = deferred();
  let count = 0;
  const app = environment({ requestDriverTripInterruption: () => { count++; return { unwrap: () => pending.promise }; } });
  const actions = app.render();
  const first = actions.sendDriverInterruptionRequest('emergency');
  await actions.sendDriverInterruptionRequest('emergency');
  await actions.pauseTripWithoutPassengerConfirmation();
  assert.equal(count, 1);
  assert.equal(app.mutations.length, 0);
  pending.resolve({ status: 'ongoing' });
  await first;
  await actions.sendDriverInterruptionRequest('other');
  assert.equal(count, 1, 'the exit guard also rejects actions while native views are releasing');
  app.unmount();
});

for (const change of ['unmount', 'blur', 'new-trip']) {
  test(`late interruption success after ${change} cannot redirect or clear another screen`, async () => {
    const pending = deferred();
    const app = environment({ requestDriverTripInterruption: () => ({ unwrap: () => pending.promise }) });
    const action = app.render().sendDriverInterruptionRequest('other');
    if (change === 'unmount') app.unmount();
    else {
      if (change === 'blur') app.params.isScreenActive = false;
      else app.params.tripId = 'trip-2';
      app.render();
    }
    pending.resolve({ status: 'ongoing' });
    await action;
    assert.equal(app.events.length, 0);
    assert.equal(app.dialogs.length, 0);
    app.unmount();
  });
}

test('a pause accepted after unmount stops only that trip background task, not a new screen', async () => {
  const pending = deferred();
  const app = environment({ pauseTrip: () => ({ unwrap: () => pending.promise }) });
  const action = app.render().pauseTripWithoutPassengerConfirmation();
  app.unmount();
  pending.resolve({ status: 'upcoming' });
  await action;
  assert.deepEqual(app.events, ['stop-background:trip-1']);
});

test('pending/already interrupted trips leave on back without an extra confirmation; ongoing trips retain it', () => {
  for (const params of [
    { trip: { status: 'ongoing' }, activeDriverInterruptionRequest: { id: 'request', status: 'pending' } },
    { trip: { status: 'upcoming' } },
  ]) {
    const app = environment(params);
    app.render();
    assert.equal(app.hardwareBack(), true);
    assert.deepEqual(app.events, ['exit']);
    assert.equal(app.dialogs.length, 0);
    app.unmount();
  }
  const app = environment();
  app.render().handleExitNavigation();
  assert.equal(app.events.length, 0);
  assert.equal(app.dialogs[0].title, 'Quitter la navigation');
  app.dialogs[0].actions.find(a => a.label === 'Quitter').onPress();
  assert.deepEqual(app.events, ['exit']);
  assert.equal(app.mutations.length, 0);
  app.unmount();
});

test('an existing interruption request offers direct exit without creating another request', () => {
  const app = environment({ activeDriverInterruptionRequest: { id: 'request', status: 'pending' },
    activeDriverInterruptionConfirmedCount: 1, activeDriverInterruptionRequiredCount: 2 });
  app.render().handlePauseTripFromNavigation();
  app.dialogs[0].actions.find(a => a.label === 'Quitter la navigation').onPress();
  assert.equal(app.dialogs.length, 1);
  assert.equal(app.mutations.length, 0);
  assert.deepEqual(app.events, ['exit']);
  app.unmount();
});
