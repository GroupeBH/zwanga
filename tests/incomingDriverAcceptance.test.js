const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const id = '00000000-0000-4000-8000-000000000001';
const driverId = '00000000-0000-4000-8000-000000000002';
const tripId = '00000000-0000-4000-8000-000000000003';
const requestId = '00000000-0000-4000-8000-000000000004';
const tick = () => new Promise(resolve => setImmediate(resolve));
const nodes = value => !value || typeof value !== 'object' ? [] : Array.isArray(value)
  ? value.flatMap(nodes) : [value, ...nodes(value.props?.children)];
const words = value => typeof value === 'string' ? value : Array.isArray(value)
  ? value.map(words).join(' ') : value && typeof value === 'object' ? words(value.props?.children) : '';

function fixture(t, kind = 'booking') {
  const hooks = hookHarness(), routes = [], mutations = [], actions = [], dismissals = [], reads = [];
  const env = { active: true, userId: driverId, session: 1, decision: null };
  const bookingData = { id, tripId, status: 'pending', passengerName: 'Passager test', numberOfSeats: 1,
    paymentMode: 'cash', trip: { id: tripId, driverId, status: 'upcoming', price: 1000,
      departure: { address: 'Départ' }, arrival: { address: 'Arrivée' } } };
  const offerData = { id, driverId, requestId, status: 'pending', actionable: true,
    serverNow: new Date().toISOString(), expiresAt: new Date(Date.now() + 30000).toISOString(),
    request: { id: requestId, passengerName: 'Passager test', departure: 'Départ', arrival: 'Arrivée',
      seats: 1, pricePerSeat: 1000, paymentMode: 'cash' } };
  const query = (data, kind) => ({ data, currentData: data, isFetching: false, isError: false, error: undefined,
    refetch: async () => { reads.push(kind); return { data }; } });
  env.booking = query(bookingData, 'booking'); env.offer = query(offerData, 'dispatch');
  env.perform = async payload => kind === 'booking'
    ? { id, tripId, status: payload.accept ? 'accepted' : 'rejected' }
    : { requestId, status: payload.decision === 'accept' ? 'accepted' : 'declined' };
  const router = { replace: href => routes.push(href), canGoBack: () => false, back() {} };
  const mutate = type => payload => ({ unwrap: async () => {
    mutations.push({ type, payload }); return env.perform(payload);
  } });
  const load = loader({
    react: hooks.react,
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll',
      ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'Safe' },
    'expo-router': { useRouter: () => router, useLocalSearchParams: () => ({ id, kind }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => env.active },
    '@/services/tokenSession': { getTokenSessionVersion: () => env.session },
    '@/store/hooks': { useAppDispatch: () => action => actions.push(action) },
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: env.userId ? { id: env.userId } : undefined }) },
    '@/store/api/bookingApi': { useGetBookingByIdQuery: () => env.booking },
    '@/store/api/driverDispatchApi': {
      useGetDispatchOfferQuery: () => env.offer,
      useRespondToDispatchOfferMutation: () => [mutate('dispatch')],
      useRespondToBookingInvitationMutation: () => [mutate('booking')],
    },
    '@/services/driverNotifications': {
      consumeDriverAction: async () => env.decision,
      dismissDriverInvitation: async invitation => dismissals.push(invitation),
    },
    '@/utils/errorHelpers': { getApiErrorMessage: (error, fallback) => error?.message || fallback },
    '@/features/driver-payments/CashCommissionNotice': { CashCommissionNotice: 'CashNotice' },
    '@/features/request-detail/RequestPassengerContact': { RequestPassengerContact: 'Contact' },
  });
  const Screen = load('app/incoming-driver.tsx').default;
  const render = () => hooks.render(() => { const child = Screen(); return child.type(child.props); });
  const press = label => {
    const button = nodes(render()).find(node => node.type === 'Button' && words(node) === label);
    assert.ok(button, `Missing action: ${label}`); assert.equal(Boolean(button.props.disabled), false);
    button.props.onPress();
    return button.props.onPress;
  };
  t.after(() => hooks.unmount());
  return { env, routes, mutations, actions, dismissals, reads, render, press, unmount: () => hooks.unmount() };
}

for (const ongoing of [false, true]) {
  test(`booking acceptance goes directly to ${ongoing ? 'navigation' : 'trip management'}, without a success/details card`, async t => {
    const app = fixture(t);
    app.env.booking.data.trip.status = ongoing ? 'ongoing' : 'upcoming';
    const pressAgain = app.press('Accepter'); pressAgain();
    await tick();
    assert.equal(app.mutations.length, 1);
    assert.deepEqual(app.routes, [{ pathname: ongoing ? '/trip/navigate/[id]' : '/trip/manage/[id]', params: { id: tripId } }]);
    assert.equal(app.render(), null);
    assert.doesNotMatch(words(app.render()), /C’est confirmé|Voir les détails|Un passager vous attend/);
    assert.ok(app.dismissals.length > 0);
  });
}

test('dispatch acceptance still opens the accepted request directly, preserving its contact intent', async t => {
  const app = fixture(t, 'dispatch');
  app.press('Accepter'); await tick();
  assert.deepEqual(app.routes, [{ pathname: '/request-details/[id]', params: { id: requestId } }]);
  assert.equal(app.render(), null);
  assert.equal(app.mutations.length, 1);
});

for (const kind of ['booking', 'dispatch']) {
  test(`a confirmed ${kind} opened from a notification skips the invitation card without replaying acceptance`, async t => {
    const app = fixture(t, kind);
    app.env.decision = 'accept';
    app.env[kind === 'booking' ? 'booking' : 'offer'].currentData.status = 'accepted';
    assert.equal(app.render(), null);
    assert.equal(app.routes.length, 1);
    assert.equal(app.routes[0].params.id, kind === 'booking' ? tripId : requestId);
    app.render(); app.render(); await tick();
    assert.equal(app.routes.length, 1);
    assert.deepEqual(app.mutations, []);
    if (kind === 'dispatch') {
      assert.equal(app.actions[0].type, 'rideEntry/inviteAcceptedRequestContact');
      assert.equal(app.actions[0].payload.requestId, requestId);
    }
  });

  test(`a pending ${kind} native action is handled once and opens the destination without the success card`, async t => {
    const app = fixture(t, kind);
    app.env.decision = 'accept';
    app.render(); await tick(); app.render(); await tick();
    assert.equal(app.mutations.length, 1);
    assert.equal(app.routes.length, 1);
    assert.equal(app.render(), null);
  });

  test(`${kind} acceptance is not inferred from stale data, a failed read or a foreign account`, async t => {
    const app = fixture(t, kind);
    const query = app.env[kind === 'booking' ? 'booking' : 'offer'];
    query.data = { ...query.data, status: 'accepted' }; query.currentData = undefined;
    app.render(); assert.deepEqual(app.routes, []);
    query.currentData = query.data; query.isFetching = true;
    assert.doesNotMatch(words(app.render()), /Un passager vous attend|Voir les détails/);
    assert.deepEqual(app.routes, []);
    query.isFetching = false; query.isError = true; query.error = { status: 503 };
    app.render(); assert.deepEqual(app.routes, []);
    query.isError = false; query.error = undefined; app.env.userId = 'another-driver';
    app.render(); assert.deepEqual(app.routes, []);
    assert.deepEqual(app.mutations, []);
  });

  test(`${kind} network failure stays actionable; a later server acceptance redirects without another mutation`, async t => {
    const app = fixture(t, kind);
    app.env.perform = async () => { throw new Error('Connexion interrompue'); };
    app.press('Accepter'); await tick();
    assert.deepEqual(app.routes, []);
    assert.match(words(app.render()), /Connexion interrompue/);
    assert.equal(app.mutations.length, 1); assert.deepEqual(app.reads, [kind]);
    app.env[kind === 'booking' ? 'booking' : 'offer'].currentData.status = 'accepted';
    assert.equal(app.render(), null);
    assert.equal(app.routes.length, 1);
    assert.equal(app.mutations.length, 1);
  });

  test(`${kind} pending proposals still offer Accept/Decline; declining does not redirect as accepted`, async t => {
    const app = fixture(t, kind);
    assert.match(words(app.render()), /Refuser.*Accepter/);
    app.press('Refuser'); await tick();
    assert.match(words(app.render()), /Proposition refusée/);
    assert.deepEqual(app.routes, []);
    assert.equal(app.mutations.length, 1);
  });

  for (const change of ['account', 'session', 'background', 'unmount']) {
    test(`${kind} late acceptance cannot navigate after ${change}`, async t => {
      const app = fixture(t, kind); let finish;
      app.env.perform = () => new Promise(resolve => { finish = resolve; });
      app.press('Accepter'); await tick();
      if (change === 'account') app.env.userId = 'other';
      if (change === 'session') app.env.session++;
      if (change === 'background') app.env.active = false;
      if (change === 'unmount') app.unmount(); else app.render();
      finish({ id, tripId, requestId, status: 'accepted' }); await tick();
      assert.deepEqual(app.routes, []);
    });
  }
}

test('unexpected booking response does not produce a false success or redirect to another trip', async t => {
  const app = fixture(t);
  app.env.perform = async () => ({ id, tripId: 'another-trip', status: 'accepted' });
  app.press('Accepter'); await tick();
  assert.deepEqual(app.routes, []);
  assert.match(words(app.render()), /pas encore confirmée/);
  assert.equal(app.mutations.length, 1);
});
