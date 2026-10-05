const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const load = loader();
const { rideActionResultContent, rideSaveError } = load('features/ride-recovery/rideActionResultModel.ts');
const { RideOutboxError } = load('features/ride-recovery/rideOutboxEngine.ts');
const slice = load('store/slices/rideRecoverySlice.ts');
const target = { tripId: 'trip', bookingId: 'booking', stage: 'pickup', actor: 'passenger', numberOfSeats: 3 };
const entry = { eventId: 'event', actorUserId: 'passenger', tripId: 'trip', bookingId: 'booking', stage: 'pickup', state: 'queued', decision: 'confirm' };
const result = { ...target, id: 'result', userId: 'passenger', receipt: { eventId: 'event', state: 'queued', decision: 'confirm' } };

test('both stages and roles distinguish local save, server receipt, definitive success and failure', () => {
  for (const stage of ['pickup', 'dropoff']) for (const actor of ['driver', 'passenger']) {
    const r = { ...result, stage, actor, userId: actor }, e = { ...entry, stage, actorUserId: actor };
    for (const state of ['queued', 'sending', 'received']) {
      const content = rideActionResultContent(r, { ...e, state });
      assert.equal(content.stageLabel, stage === 'pickup' ? 'Embarquement' : 'Arrivée à destination');
      assert.equal(content.tone, 'pending'); assert.doesNotMatch(content.title, /Embarquement confirmé|Arrivée à destination confirmée/);
      if (state === 'received') assert.match(content.message, actor === 'driver' ? /du passager/ : /du conducteur/);
    }
    const confirmed = rideActionResultContent(r, { ...e, state: 'confirmed' });
    assert.equal(confirmed.tone, 'success'); assert.equal(confirmed.title, stage === 'pickup' ? 'Embarquement confirmé' : 'Arrivée à destination confirmée');
    assert.doesNotMatch(confirmed.message, /paiement confirmé|payé|encaissé/i);
    for (const state of ['blocked', 'disputed']) assert.equal(rideActionResultContent(r, { ...e, state }).tone, 'danger');
    assert.equal(rideActionResultContent({ ...r, receipt: undefined, error: 'Écriture impossible.' }).title, 'Confirmation non enregistrée');
  }
});

test('only matching receipts/snapshots can advance the result, and an old read cannot regress final success', () => {
  for (const patch of [{ eventId: 'other' }, { actorUserId: 'other' }, { bookingId: 'other' }, { tripId: 'other' }, { stage: 'dropoff' }]) {
    assert.equal(rideActionResultContent(result, { ...entry, state: 'confirmed', ...patch }).tone, 'pending');
  }
  const snapshot = { bookingId: 'booking', tripId: 'trip', actor: 'passenger', pickup: { status: 'confirmed' }, dropoff: { status: 'none' } };
  assert.equal(rideActionResultContent(result, entry, snapshot).tone, 'success');
  for (const patch of [{ bookingId: 'other' }, { tripId: 'other' }, { actor: 'driver' }]) {
    assert.equal(rideActionResultContent(result, entry, { ...snapshot, ...patch }).tone, 'pending');
  }
  assert.equal(rideActionResultContent(result, { ...entry, state: 'confirmed' }, { ...snapshot, pickup: { status: 'disputed' } }).tone, 'success');
  assert.equal(rideActionResultContent(result, entry, { ...snapshot, pickup: { status: 'awaiting_other', driver: 'confirm' } }).phase, 'queued');
  assert.equal(rideActionResultContent(result, entry, { ...snapshot, pickup: { status: 'awaiting_other', passenger: 'confirm' } }).phase, 'received');
  const ready = rideActionResultContent(result, entry, { ...snapshot, pickup: { status: 'ready' } });
  assert.equal(ready.phase, 'ready'); assert.doesNotMatch(ready.message, /attente.*conducteur/);
});

test('local failures stay in French and never expose native error text', () => {
  assert.doesNotMatch(rideSaveError(new Error('SQLITE FULL /data/private')), /SQLITE|private/);
  assert.match(rideSaveError(new Error('disk full')), /Impossible d’enregistrer/);
  assert.equal(rideSaveError(new RideOutboxError('Le compte a changé.')), 'Le compte a changé.');
});

test('result state is transient and an old dismiss callback cannot close a newer result or clear its receipt', () => {
  let state = slice.default(undefined, { type: 'init' });
  state = slice.default(state, slice.rideOutboxLoaded({ userId: 'passenger', entries: [entry] }));
  state = slice.default(state, slice.showRideActionResult(result)); const first = state.actionResult.id;
  state = slice.default(state, slice.showRideActionResult({ ...result, stage: 'dropoff' })); const second = state.actionResult.id;
  assert.notEqual(first, second);
  state = slice.default(state, slice.dismissRideActionResult(first)); assert.equal(state.actionResult.id, second);
  state = slice.default(state, slice.dismissRideActionResult(second)); assert.equal(state.actionResult, null); assert.equal(state.entries.length, 1);
  state = slice.default(state, slice.rideOutboxLoaded({ userId: 'passenger', entries: [{ ...entry, state: 'confirmed' }] }));
  assert.equal(state.actionResult, null, 'a late acknowledgement never reopens a dismissed result');
  state = slice.default(state, slice.showRideActionResult(result));
  assert.equal(slice.default(state, slice.resetRideRecovery()).actionResult, null);
});

test('feedback keeps only receipt metadata and rejects old-account or wrong-booking async results', () => {
  const hooks = hookHarness(), actions = [];
  let userId = 'passenger';
  const { useRideActionFeedback } = loader({ react: { ...React, ...hooks.react },
    '@/store/hooks': { useAppDispatch: () => action => actions.push(action), useAppSelector: fn => fn({ auth: { user: { id: userId } } }) },
  })('hooks/navigation/useRideActionFeedback.ts');
  const render = () => hooks.render(useRideActionFeedback);
  const feedback = render();
  feedback.saved(target, { ...entry, latitude: 1, longitude: 2 });
  assert.equal(actions.length, 1); assert.equal(actions[0].payload.receipt.latitude, undefined);
  feedback.saved(target, { ...entry, bookingId: 'other' }); assert.equal(actions.length, 1);
  userId = 'another'; render();
  feedback.saved(target, entry); feedback.failed(target, new Error('disk full')); assert.equal(actions.length, 1);
  render().failed({ ...target, actor: 'driver' }, new Error('disk full')); assert.equal(actions.length, 2);
  assert.match(actions[1].payload.error, /Impossible d’enregistrer/);
  hooks.unmount();
});

function resultHost() {
  const hooks = hookHarness();
  const state = { auth: { user: { id: 'passenger' } }, rideRecovery: slice.default(undefined, slice.rideOutboxLoaded({ userId: 'passenger', entries: [entry] })) };
  const dispatch = action => { state.rideRecovery = slice.default(state.rideRecovery, action); };
  const { RideActionResult } = loader({ react: { ...React, ...hooks.react, memo: component => component },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: fn => fn(state) },
    '@/store/api/rideRecoveryApi': { rideRecoveryApi: { endpoints: { getRideDeclarations: { select: () => () => ({ data: [] }) } } } },
    './RideActionResultModal': { RideActionResultModal: 'ResultModal' },
  })('features/ride-recovery/RideActionResult.tsx');
  const props = { ...target, active: true };
  const render = () => hooks.render(() => RideActionResult(props));
  return { hooks, state, props, dispatch, render };
}

test('a result survives button removal, updates in place, and closing never writes another declaration', () => {
  const h = resultHost(); h.dispatch(slice.showRideActionResult(result));
  const tree = h.render(); assert.equal(tree.type, 'ResultModal'); const key = tree.key;
  h.dispatch(slice.rideOutboxLoaded({ userId: 'passenger', entries: [{ ...entry, state: 'blocked', message: 'Le trajet a changé.' }] }));
  assert.equal(h.render().key, key); assert.equal(h.render().props.entry.state, 'blocked');
  tree.props.onClose(); assert.equal(h.render(), null); assert.equal(h.state.rideRecovery.entries[0].state, 'blocked');
  h.hooks.unmount();
});

test('blur, account change and route cleanup remove results without affecting another trip', () => {
  for (const change of ['blur', 'account', 'unmount']) {
    const h = resultHost(); h.dispatch(slice.showRideActionResult(result)); assert.ok(h.render());
    if (change === 'blur') h.props.active = false;
    if (change === 'account') h.state.auth.user.id = 'other';
    if (change === 'unmount') h.hooks.unmount(); else { assert.equal(h.render(), null); h.hooks.unmount(); }
    assert.equal(h.state.rideRecovery.actionResult, null, change);
  }
  const h = resultHost(); h.dispatch(slice.showRideActionResult({ ...result, tripId: 'another' }));
  assert.equal(h.render(), null); h.hooks.unmount(); assert.ok(h.state.rideRecovery.actionResult);
  const hidden = resultHost(); hidden.props.active = false;
  hidden.dispatch(slice.showRideActionResult(result)); assert.equal(hidden.render(), null); hidden.hooks.unmount();
  assert.ok(hidden.state.rideRecovery.actionResult, 'an inactive duplicate route must not dismiss the visible route result');
});

test('result overlay pauses payment, but never masks SOS or an important confirmation', () => {
  const { createRideOverlayStore, RIDE_OVERLAY_PRIORITY: priority } = load('features/navigation/rideOverlayStore.ts');
  const store = createRideOverlayStore(); store.setScope('passenger:booking', true);
  const put = (id, p, scope = 'passenger:booking') => store.put({ id, priority: p, scope, children: id });
  put('payment', priority.payment, 'global'); put('result', priority.result);
  assert.equal(store.getActive().id, 'result'); put('confirm', priority.confirmation); assert.equal(store.getActive().id, 'confirm');
  put('sos', priority.sos); assert.equal(store.getActive().id, 'sos');
  store.remove('sos'); store.remove('confirm'); assert.equal(store.getActive().id, 'result');
  store.remove('result'); assert.equal(store.getActive().id, 'payment');
});

test('both navigation routes host the result outside the disappearing recovery button', () => {
  const fs = require('node:fs');
  for (const [file, actor] of [['app/booking/navigate/[id].tsx', 'passenger'], ['app/trip/navigate/[id].tsx', 'driver']]) {
    const source = fs.readFileSync(file, 'utf8');
    assert.match(source, new RegExp('<RideOverlayScope[^>]+>\\s*<RideActionResult actor="' + actor + '"'));
  }
});
