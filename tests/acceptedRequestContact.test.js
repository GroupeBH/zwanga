const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { getAcceptedRequestContact } = loader()('features/request-detail/acceptedRequestContact.ts');
const slice = loader()('store/slices/rideEntrySlice.ts');
const request = { id: 'request', status: 'driver_selected', selectedDriverId: 'driver', passengerId: 'passenger',
  passengerName: 'Passager de test', passengerPhone: '+243999000111' };

test('only the assigned driver sees a confirmed passenger contact, with optional server-provided phone', () => {
  assert.equal(getAcceptedRequestContact(request, 'driver').phone, request.passengerPhone);
  for (const patch of [{ status: 'pending' }, { status: 'expired' }, { status: 'cancelled' },
    { selectedDriverId: 'another' }, { passengerId: 'driver' }, { passengerId: '' }]) {
    assert.equal(getAcceptedRequestContact({ ...request, ...patch }, 'driver'), null);
  }
  assert.equal(getAcceptedRequestContact(request, undefined), null);
  for (const passengerPhone of [null, undefined, '', 'bad']) {
    const contact = getAcceptedRequestContact({ ...request, passengerPhone }, 'driver');
    assert.equal(contact.phone, null); assert.equal(contact.id, 'passenger', 'Zwanga messaging remains available');
  }
});

test('UI contact intents are deduplicated, bounded, account-scoped and cleared on session reset', () => {
  let state = slice.default(undefined, { type: 'init' });
  const invite = slice.inviteAcceptedRequestContact({ userId: 'driver', requestId: 'request' });
  state = slice.default(state, invite); state = slice.default(state, invite); assert.equal(state.pending.length, 1);
  assert.deepEqual(Object.keys(state.pending[0]).sort(), ['createdAt', 'requestId', 'userId']);
  state = slice.default(state, slice.dismissAcceptedRequestContact(invite.payload));
  state = slice.default(state, invite); assert.equal(state.pending.length, 0, 'Plus tard is not immediately prompted again');
  state = slice.default(state, slice.inviteAcceptedRequestContact({ userId: 'another', requestId: 'request' }));
  assert.equal(state.pending.length, 1);
  for (let i = 0; i < 100; i++) state = slice.default(state, slice.inviteAcceptedRequestContact({ userId: 'driver', requestId: `${i}` }));
  assert.equal(state.pending.length, 10);
  assert.deepEqual(slice.default(state, slice.resetRideEntry()), { pending: [], handled: [] });
});

test('request mapper preserves only contact data actually returned by the backend', () => {
  const { mapServerTripRequestToClient } = loader()('store/api/trip-request/requestMapper.ts');
  const server = { id: 'request', passenger: { id: 'passenger', firstName: 'Test', lastName: 'Passager' },
    selectedDriver: { id: 'driver', firstName: 'Test', lastName: 'Conducteur' }, status: 'driver_selected' };
  assert.equal(mapServerTripRequestToClient(server).passengerPhone, null);
  assert.equal(mapServerTripRequestToClient({ ...server, passenger: { ...server.passenger, phone: request.passengerPhone } }).passengerPhone, request.passengerPhone);
});

test('dispatch prompts only for server-confirmed acceptance in the original account/session', async () => {
  let endpoints, userId = 'driver', version = 0;
  loader({ './baseApi': { baseApi: { injectEndpoints: config => {
    endpoints = config.endpoints({ mutation: value => value, query: value => value }); return {};
  } } }, '@/services/tokenSession': { getTokenSessionVersion: () => version } })('store/api/driverDispatchApi.ts');
  const calls = [];
  const run = (decision, queryFulfilled) => endpoints.respondToDispatchOffer.onQueryStarted({ id: 'offer', decision },
    { dispatch: action => calls.push(action), getState: () => ({ auth: { user: { id: userId } } }), queryFulfilled });
  await run('decline', Promise.resolve({ data: { status: 'declined', requestId: 'request' } }));
  await run('accept', Promise.reject(Error('offline'))); assert.deepEqual(calls, []);
  let finish; const work = run('accept', new Promise(resolve => { finish = resolve; }));
  assert.deepEqual(calls, []); finish({ data: { status: 'accepted', requestId: 'request' } }); await work;
  assert.equal(calls[0].type, 'rideEntry/inviteAcceptedRequestContact'); assert.equal(calls[0].payload.userId, 'driver');
  calls.length = 0;
  for (const change of ['account', 'session']) {
    userId = 'driver'; const late = run('accept', new Promise(resolve => { finish = resolve; }));
    if (change === 'account') userId = 'other'; else version++;
    finish({ data: { status: 'accepted', requestId: 'request' } }); await late; assert.deepEqual(calls, []);
  }
});

test('direct acceptance queues contact only after confirmation, not after failure or session change', async () => {
  let endpoints, version = 0;
  const calls = [];
  loader({ './baseApi': { baseApi: { injectEndpoints: config => {
    endpoints = config.endpoints({ mutation: value => value, query: value => value });
    return { util: { updateQueryData: () => ({ type: 'cache-update' }) } };
  } } }, './tripApi': { mapServerTripToClient: value => value },
    '@/services/tokenSession': { getTokenSessionVersion: () => version },
  })('store/api/tripRequestApi.ts');
  const run = queryFulfilled => endpoints.acceptTripRequest.onQueryStarted({ tripRequestId: 'request' },
    { dispatch: action => calls.push(action), queryFulfilled });
  await run(Promise.reject(Error('network'))); assert.deepEqual(calls, []);
  let finish; const work = run(new Promise(resolve => { finish = resolve; }));
  assert.deepEqual(calls, []); finish({ data: { tripRequest: request } }); await work;
  assert.equal(calls[0].type, 'rideEntry/inviteAcceptedRequestContact');
  assert.equal(calls[0].payload.requestId, 'request'); assert.equal(calls[0].payload.userId, 'driver');
  calls.length = 0;
  const late = run(new Promise(resolve => { finish = resolve; })); version++;
  finish({ data: { tripRequest: request } }); await late; assert.deepEqual(calls, []);
});

function coordinator(t, overrides = {}) {
  const hooks = hookHarness(), calls = [], queries = [];
  const intent = { userId: 'driver', requestId: 'request', createdAt: 100 };
  const env = { active: true, path: '/', userId: 'driver', authenticated: true, intent,
    request: { currentData: request, isFetching: false, isError: false, fulfilledTimeStamp: 101, refetch: () => calls.push('retry') },
    trip: { currentData: { id: 'trip', driverId: 'driver', status: 'upcoming' }, isFetching: false, isError: false, fulfilledTimeStamp: 101 }, ...overrides };
  const { AcceptedRequestContactCoordinator } = loader({ react: hooks.react,
    'expo-router': { usePathname: () => env.path }, '@/hooks/useAppIsActive': { useAppIsActive: () => env.active },
    '@/store/hooks': { useAppDispatch: () => action => calls.push(action), useAppSelector: select => select({
      auth: { user: { id: env.userId }, isAuthenticated: env.authenticated }, rideEntry: { pending: [intent] } }) },
    '@/store/selectors': { selectIsAuthenticated: s => s.auth.isAuthenticated },
    '@/store/api/tripRequestApi': { useGetTripRequestByIdQuery: (id, options) => { queries.push(['request', id, options]); return env.request; } },
    '@/store/api/tripApi': { useGetTripByIdQuery: (id, options) => { queries.push(['trip', id, options]); return env.trip; } },
    '@/features/navigation/NavigationContactModal': { ContactModalContent: 'Contacts' },
  })('components/AcceptedRequestContactCoordinator.tsx');
  t.after(() => hooks.unmount());
  const render = () => {
    const child = AcceptedRequestContactCoordinator();
    return child ? hooks.render(() => child.type(child.props)) : null;
  };
  return { env, calls, queries, render };
}

test('confirmed acceptance opens existing contact choices with an explicit Plus tard, not an automatic message', t => {
  const app = coordinator(t); const view = app.render();
  assert.equal(view.type, 'Contacts'); assert.equal(view.props.title, 'Contactez votre passager');
  assert.equal(view.props.closeLabel, 'Plus tard'); assert.equal(view.props.contacts[0].id, 'passenger');
  assert.deepEqual(app.calls, []); assert.equal(app.queries[1][2].skip, true, 'dispatch can be accepted before a trip is created');
  view.props.onClose(); assert.equal(app.calls[0].type, 'rideEntry/dismissAcceptedRequestContact');
});

test('stale cache and failed contact reads never expose phone details; network failures are retryable', t => {
  const app = coordinator(t); app.env.request.fulfilledTimeStamp = 90;
  let view = app.render(); assert.deepEqual(view.props.contacts, []); assert.equal(view.props.loading, true);
  app.env.request.isError = true; view = app.render(); assert.deepEqual(view.props.contacts, []);
  assert.ok(view.props.loadError); view.props.onRetry(); assert.deepEqual(app.calls, ['retry']);
});

test('cancelled/reassigned requests and completed/foreign trips dismiss the pending contact prompt', t => {
  for (const patch of [{ status: 'cancelled' }, { selectedDriverId: 'another' }]) {
    const app = coordinator(t, { request: { currentData: { ...request, ...patch }, fulfilledTimeStamp: 101 } });
    assert.equal(app.render(), null); assert.equal(app.calls[0].type, 'rideEntry/dismissAcceptedRequestContact');
  }
  for (const patch of [{ status: 'completed' }, { driverId: 'another' }]) {
    const app = coordinator(t, { request: { currentData: { ...request, tripId: 'trip' }, fulfilledTimeStamp: 101 },
      trip: { currentData: { id: 'trip', driverId: 'driver', status: 'ongoing', ...patch }, fulfilledTimeStamp: 101 } });
    assert.equal(app.render(), null); assert.equal(app.calls[0].type, 'rideEntry/dismissAcceptedRequestContact');
  }
});

test('contact coordinator stays silent in background, another account, auth, chat and payment', t => {
  for (const patch of [{ active: false }, { userId: 'other' }, { authenticated: false }, { path: '/incoming-driver' },
    { path: '/chat/thread' }, { path: '/booking/payment' }, { path: '/rate/booking' }]) {
    const app = coordinator(t, patch); assert.equal(app.render(), null); assert.deepEqual(app.queries, []);
  }
});
