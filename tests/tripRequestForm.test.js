const test = require('node:test');
const assert = require('node:assert/strict');
const { configureStore, findNonSerializableValue } = require('@reduxjs/toolkit');
const { createApi, skipToken } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const model = loader()('features/trip-request/requestFormModel.ts');
const slice = loader()('store/slices/requestDraftsSlice.ts');

test('drafts preserve defaults, remain serializable and are isolated per form', () => {
  const first = slice.createRequestDraft(1_900_000_000_000, 40);
  assert.equal(first.numberOfSeats, 1);
  assert.equal(first.hasSpecifiedNumberOfSeats, false);
  assert.equal(first.requestPaymentMode, 'cash');
  assert.equal(first.maxPricePerSeat, '');
  let state = slice.default(undefined, slice.initializeRequestDraft({ id: 'a', draft: first }));
  state = slice.default(state, slice.initializeRequestDraft({ id: 'b', draft: first }));
  state = slice.default(state, slice.changeRequestDraft({ id: 'a', change: { field: 'maxPricePerSeat', value: '2500' } }));
  state = slice.default(state, slice.initializeRequestDraft({ id: 'a', draft: first }));
  assert.equal(state.byId.a.maxPricePerSeat, '2500');
  assert.equal(state.byId.b.maxPricePerSeat, '');
  assert.equal(findNonSerializableValue(state), false);
  assert.deepEqual(JSON.parse(JSON.stringify(state)), state);
});

test('closed drafts cannot be resurrected and logout/account reset removes all drafts', () => {
  const open = () => slice.default(undefined, slice.initializeRequestDraft({ id: 'a', draft: slice.createRequestDraft(100, 40) }));
  let state = slice.default(open(), slice.discardRequestDraft('a'));
  state = slice.default(state, slice.changeRequestDraft({ id: 'a', change: { field: 'departureManualAddress', value: 'Late result' } }));
  assert.deepEqual(state.byId, {});
  for (const type of ['auth/logout', 'auth/performLogout/fulfilled', 'auth/performLogout/rejected', 'requestDrafts/resetRequestDrafts']) {
    assert.deepEqual(slice.default(open(), { type }).byId, {});
  }
});

test('draft hook applies consecutive functional updates to current Redux state and stores dates as numbers', () => {
  const store = configureStore({ reducer: { requestDrafts: slice.default } });
  const hooks = hookHarness('draft-a');
  const { useRequestDraft } = loader({
    react: hooks.react,
    'react-redux': { useStore: () => store },
    '@/store/hooks': { useAppDispatch: () => store.dispatch, useAppSelector: (selector) => selector(store.getState()) },
  })('hooks/trip-request/useRequestDraft.ts');
  const draft = hooks.render(useRequestDraft);
  draft.setNumberOfSeats((value) => value + 1);
  draft.setNumberOfSeats((value) => value + 1);
  const date = new Date('2030-09-11T12:30:00Z');
  draft.setDepartureDateMin(date);
  const updated = hooks.render(useRequestDraft);
  assert.equal(updated.numberOfSeats, 3);
  assert.equal(updated.setNumberOfSeats, draft.setNumberOfSeats);
  assert.equal(updated.departureDateMin.getTime(), date.getTime());
  assert.equal(store.getState().requestDrafts.byId['draft-a'].departureDateMinMs, date.getTime());
  assert.equal(findNonSerializableValue(store.getState()), false);
  hooks.unmount();
  draft.setDepartureManualAddress('Late update');
  assert.deepEqual(store.getState().requestDrafts.byId, {});
});

test('manual budget permits submission without an estimate, but known vehicle capacity still applies', () => {
  assert.equal(model.getRequestBudgetState('', false).canSubmitRequestDetails, false);
  assert.equal(model.getRequestBudgetState('2000', false).canSubmitRequestDetails, false);
  assert.equal(model.getRequestBudgetState('invalid', true).canSubmitRequestDetails, false);
  const manual = model.getRequestBudgetState('2500', true);
  assert.equal(manual.canSubmitRequestDetails, true);
  assert.equal(manual.budgetValue * 2, 5000);
  const estimate = { recommendedPricePerSeat: 3000, availableForRequestedSeats: true };
  assert.equal(model.getRequestBudgetState('', false, estimate).budgetValue, 3000);
  assert.equal(model.getRequestBudgetState('2500', true, estimate).budgetValue, 2500);
  assert.equal(model.getRequestBudgetState('2500', true, { ...estimate, recommendedPricePerSeat: null }).canSubmitRequestDetails, true);
  assert.equal(model.getRequestBudgetState('2500', true, { ...estimate, availableForRequestedSeats: false }).canSubmitRequestDetails, false);
});

test('vehicle recommendation endpoint shares identical reads in RTK Query and separates distinct routes', async () => {
  const calls = [];
  const baseApi = createApi({ reducerPath: 'testApi', baseQuery: async (args) => {
    calls.push(args);
    return { data: { options: [], distanceMeters: 1200 } };
  }, endpoints: () => ({}) });
  const api = loader({ './baseApi': { baseApi }, './tripApi': { mapServerTripToClient: (value) => value } })('store/api/tripRequestApi.ts').tripRequestApi;
  const store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: (defaults) => defaults().concat(api.middleware) });
  const args = { departureLocation: 'Gombe', arrivalLocation: 'Limete' };
  const endpoint = api.endpoints.tripRequestVehicleOptions;
  const first = store.dispatch(endpoint.initiate(args));
  const duplicate = store.dispatch(endpoint.initiate({ ...args }));
  try {
    await Promise.all([first.unwrap(), duplicate.unwrap()]);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { url: '/trip-requests/vehicle-options', method: 'POST', body: args });
    const other = store.dispatch(endpoint.initiate({ ...args, arrivalLocation: 'Lemba' }));
    await other.unwrap();
    other.unsubscribe();
    assert.equal(calls.length, 2);
  } finally {
    first.unsubscribe(); duplicate.unsubscribe();
    store.dispatch(api.util.resetApiState());
  }
});

test('recommendation hook debounces changes and never displays cached data from the previous route', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness();
  let receivedArgs, retries = 0;
  const old = { options: [{ vehicleType: 'car' }], distanceMeters: 1000 };
  const { useRequestVehicleOptions } = loader({
    react: hooks.react,
    'react-native': { InteractionManager: { runAfterInteractions: (callback) => { callback(); return { cancel() {} }; } } },
    '@/store/api/tripRequestApi': { useTripRequestVehicleOptionsQuery: (args) => {
      receivedArgs = args;
      return { currentData: old, isFetching: false, isError: false, refetch: () => retries++ };
    } },
  })('hooks/trip-request/useRequestVehicleOptions.ts');
  let options = { departureAddress: 'Gombe', arrivalAddress: 'Limete', departureReference: '', arrivalReference: '', departureLocation: null, arrivalLocation: null, numberOfSeats: 1, hasSpecifiedNumberOfSeats: false };
  let result = hooks.render(() => useRequestVehicleOptions(options));
  assert.equal(receivedArgs, skipToken);
  assert.deepEqual(result.vehicleOptions, []);
  t.mock.timers.tick(250);
  result = hooks.render(() => useRequestVehicleOptions(options));
  assert.equal(receivedArgs.arrivalLocation, 'Limete');
  assert.equal(Object.hasOwn(receivedArgs, 'numberOfSeats'), false);
  assert.equal(result.vehicleOptions, old.options);
  options = { ...options, arrivalAddress: 'Lemba', numberOfSeats: 2, hasSpecifiedNumberOfSeats: true };
  result = hooks.render(() => useRequestVehicleOptions(options));
  assert.deepEqual(result.vehicleOptions, []);
  result.retryVehicleOptions();
  assert.equal(retries, 0);
  t.mock.timers.tick(250);
  result = hooks.render(() => useRequestVehicleOptions(options));
  assert.equal(receivedArgs.numberOfSeats, 2);
  result.retryVehicleOptions();
  assert.equal(retries, 1);
  hooks.unmount();
});

test('shared manual geocoding debounces typing, aborts obsolete reads and ignores their late results', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness();
  const first = deferred(), second = deferred();
  let aborted = 0;
  const requests = [], selections = [];
  const geocode = (args) => {
    requests.push(args);
    return { unwrap: () => requests.length === 1 ? first.promise : second.promise, abort: () => aborted++ };
  };
  const { useManualAddressGeocode } = loader({ react: hooks.react, '@/store/api/googleMapsApi': { useGeocodeMutation: () => [geocode] } })('hooks/useManualAddressGeocode.ts');
  let address = 'Gare Centrale';
  const render = () => hooks.render(() => useManualAddressGeocode({ enabled: true, address, selection: null, onResolved: (value) => selections.push(value) }));
  render();
  t.mock.timers.tick(649);
  assert.equal(requests.length, 0);
  t.mock.timers.tick(1);
  address = 'UPN';
  render();
  assert.equal(aborted, 1);
  t.mock.timers.tick(650);
  first.resolve({ lat: -4.31, lng: 15.31 });
  await tick();
  assert.equal(selections.length, 0);
  second.resolve({ lat: -4.41, lng: 15.25 });
  await tick();
  assert.equal(selections.length, 1);
  assert.equal(selections[0].title, 'UPN');
  assert.equal(render()[0], 'found');
  hooks.unmount();
});

test('leaving the address field before its debounce ends does not launch a request', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness();
  let requests = 0;
  const geocode = () => { requests++; throw new Error('Unexpected request'); };
  const { useManualAddressGeocode } = loader({ react: hooks.react, '@/store/api/googleMapsApi': { useGeocodeMutation: () => [geocode] } })('hooks/useManualAddressGeocode.ts');
  hooks.render(() => useManualAddressGeocode({ enabled: true, address: 'Gombe', selection: null, onResolved() {} }));
  hooks.unmount();
  t.mock.timers.tick(1000);
  assert.equal(requests, 0);
});

function submissionHarness({ create, list = () => Promise.resolve([]) }) {
  const hooks = hookHarness();
  const dialogs = [], routes = [];
  const { useRequestSubmission } = loader({
    react: hooks.react,
    'expo-router': { useRouter: () => ({ replace: (route) => routes.push(route) }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: (dialog) => dialogs.push(dialog) }) },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/constants/network': { MUTATION_RECONCILIATION_DELAYS_MS: [0, 0] },
    '@/utils/errorHelpers': { isAmbiguousTransportError: (error) => error.status === 'TIMEOUT_ERROR', getApiErrorMessage: (_error, fallback) => fallback },
    '@/utils/requestNavigation': { getTripRequestDetailHref: (id) => '/request/' + id },
    '@/store/api/tripRequestApi': {
      useCreateTripRequestMutation: () => [(args) => ({ unwrap: () => create(args) }), { isLoading: false }],
      useLazyGetMyTripRequestsQuery: () => [() => ({ unwrap: list })],
    },
  })('hooks/trip-request/useRequestSubmission.ts');
  const min = new Date(Date.now() + 300_000), max = new Date(min.getTime() + 2_400_000);
  const props = {
    ...slice.createRequestDraft(min.getTime(), 40),
    departureAddress: 'Gombe', arrivalAddress: 'Limete', hasDepartureAddress: true, hasArrivalAddress: true,
    canSubmitRequestDetails: true, parsedManualBudget: 2500, hasEditedBudget: true,
    selectedVehicleOptionUnavailable: false,
    getCurrentDepartureWindow: () => ({ min, max, flex: 40 }),
    setDepartureDateMin() {}, setFlexibilityMinutes() {}, setRequestFormStep() {}, setAddressSectionStep() {},
  };
  return { hooks, dialogs, routes, props, render: () => hooks.render(() => useRequestSubmission(props)) };
}

test('submission prevents double taps, omits unspecified seats and waits for the success navigation choice', async () => {
  const pending = deferred();
  const calls = [];
  const app = submissionHarness({ create: (args) => { calls.push(args); return pending.promise; } });
  const form = app.render();
  const first = form.handleCreateRequest();
  await form.handleCreateRequest();
  assert.equal(calls.length, 1);
  assert.equal(Object.hasOwn(calls[0], 'numberOfSeats'), false);
  assert.equal(calls[0].maxPricePerSeat, 2500);
  assert.equal(calls[0].paymentMode, 'cash');
  pending.resolve({ id: 'new-request' });
  await first;
  const success = app.render();
  assert.equal(success.isRequestSuccessVisible, true);
  assert.deepEqual(app.routes, []);
  success.goToRequestSuccessDetail();
  assert.deepEqual(app.routes, ['/request/new-request']);
  assert.deepEqual(app.dialogs, []);
  app.hooks.unmount();
});

test('an explicit seat count is sent, while an untouched recommended price remains server-owned', async () => {
  let payload;
  const app = submissionHarness({ create: async (args) => { payload = args; return { id: 'created' }; } });
  app.props.hasSpecifiedNumberOfSeats = true;
  app.props.numberOfSeats = 2;
  app.props.hasEditedBudget = false;
  await app.render().handleCreateRequest();
  assert.equal(payload.numberOfSeats, 2);
  assert.equal(Object.hasOwn(payload, 'maxPricePerSeat'), false);
  app.render().goHomeAfterRequestSuccess();
  assert.deepEqual(app.routes, ['/(tabs)']);
  app.hooks.unmount();
});

test('ambiguous creation reconciles by reading requests, without replaying the POST', async () => {
  let creates = 0, reads = 0;
  const app = submissionHarness({
    create: async () => { creates++; throw { status: 'TIMEOUT_ERROR' }; },
    list: async () => { reads++; return [{ id: 'recovered', createdAt: new Date().toISOString(), departure: { name: 'Gombe' }, arrival: { name: 'Limete' } }]; },
  });
  await app.render().handleCreateRequest();
  assert.equal(creates, 1);
  assert.equal(reads, 1);
  assert.equal(app.render().createdRequestId, 'recovered');
  assert.deepEqual(app.routes, []);
  app.hooks.unmount();
});
