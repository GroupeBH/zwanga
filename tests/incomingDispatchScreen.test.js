const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const tick = () => new Promise(resolve => setImmediate(resolve));
const words = tree => typeof tree === 'string' ? tree : typeof tree === 'number' ? String(tree) :
  Array.isArray(tree) ? tree.map(words).join('') : words(tree?.props?.children ?? '');
const all = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(all) : [tree, ...all(tree.props?.children)];
function fixture() {
  const hooks = hookHarness(), options = [], routes = [], answers = [], dismissals = [];
  const data = { id: id(2), driverId: id(1), requestId: id(3), status: 'pending', actionable: true,
    request: { passengerName: 'Passager', departure: 'Départ', arrival: 'Arrivée', seats: 1, pricePerSeat: 1000, paymentMode: 'cash' } };
  const state = { data, query: { data, currentData: data, isFetching: true, isError: false, refetch: async () => {} },
    result: { status: 'accepted', requestId: id(3) } };
  const router = { replace: path => routes.push(path), canGoBack: () => false };
  const Screen = loader({ react: hooks.react,
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'Button',
      ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'Safe' }, '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { useLocalSearchParams: () => ({ kind: 'dispatch', id: id(2) }), useRouter: () => router },
    '@/store/hooks': { useAppDispatch: () => () => {} },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: { id: id(1) } }) },
    '@/store/api/bookingApi': { useGetBookingByIdQuery: () => ({}) },
    '@/store/api/driverDispatchApi': {
      useGetDispatchOfferQuery: (_id, queryOptions) => { options.push(queryOptions); return state.query; },
      useRespondToDispatchOfferMutation: () => [input => ({ unwrap: async () => { answers.push(input); return state.result; } })],
      useRespondToBookingInvitationMutation: () => [() => assert.fail('not a booking')],
    },
    '@/services/driverNotifications': { consumeDriverAction: async () => null, dismissDriverInvitation: async input => dismissals.push(input) },
    '@/features/driver-payments/CashCommissionNotice': { CashCommissionNotice: 'CashNotice' },
    '@/features/request-detail/RequestPassengerContact': { RequestPassengerContact: 'Contact' },
    '@/features/notifications/IncomingBookingRedirect': { IncomingBookingRedirect: 'BookingRedirect' },
    '@/hooks/notifications/useRideEntryAnnouncement': { useRideEntryAnnouncement() {} },
  })('app/incoming-driver.tsx').default;
  const render = () => hooks.render(() => Screen().type());
  return { hooks, state, options, routes, answers, dismissals, render };
}

test('an old cache without a receipt deadline cannot stop polling before the fresh offer arrives', async () => {
  const f = fixture();
  try {
    f.render(); f.render(); assert.equal(f.options.at(-1).pollingInterval, 5000); assert.equal(f.dismissals.length, 0);
    f.state.query.isFetching = false;
    f.state.data.localDeadline = { wall: Date.now() + 20000, monotonic: performance.now() + 20000 };
    const tree = f.render(); assert.match(words(tree), /pour répondre/);
    assert.ok(all(tree).some(node => node.type === 'Button' && words(node) === 'Accepter' && !node.props.disabled));
    f.state.data = { ...f.state.data, actionable: false };
    f.state.query = { ...f.state.query, data: f.state.data, currentData: f.state.data };
    f.render(); f.render(); await tick();
    assert.equal(f.options.at(-1).pollingInterval, 0); assert.ok(f.dismissals.length > 0);
  } finally { f.hooks.unmount(); }
});

test('missing budget is not a free trip and an unconfirmed response never opens navigation', async () => {
  const f = fixture();
  try {
    f.state.query.isFetching = false;
    f.state.data.localDeadline = { wall: Date.now() + 20000, monotonic: performance.now() + 20000 };
    f.state.data.request.pricePerSeat = null;
    let tree = f.render(); assert.match(words(tree), /Montant indisponible/);
    assert.equal(all(tree).some(node => node.type === 'CashNotice'), false);
    f.state.data.request.pricePerSeat = 1000; f.state.result.status = 'pending'; tree = f.render();
    const accept = all(tree).find(node => node.type === 'Button' && words(node) === 'Accepter');
    accept.props.onPress(); accept.props.onPress(); await tick();
    assert.equal(f.answers.length, 1); assert.deepEqual(f.routes, []); assert.deepEqual(f.dismissals, []);
    assert.match(words(f.render()), /vérifiée|confirmée/);
  } finally { f.hooks.unmount(); }
});
