const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => Array.isArray(tree) ? tree.map(words).join('') : React.isValidElement(tree) ? words(tree.props.children) : typeof tree === 'string' ? tree : '';
const profile = { id: 'member', firstName: 'Camille', lastName: 'Démo', profilePicture: null, role: 'passenger', isPhoneVerified: true,
  averageRating: 4.5, totalRatings: 2, passengerBookings: 3, createdAt: '2026-01-01' };

test('public member endpoint isolates sessions and serializes only allowed fields', () => {
  let endpoint;
  loader({ './baseApi': { baseApi: { injectEndpoints: options => {
    endpoint = options.endpoints({ query: x => x }).getPublicMember; return {};
  } } } })('store/api/publicMemberApi.ts');
  assert.deepEqual(endpoint.query({ id: 'member', viewerId: 'viewer', session: 1 }), { url: '/users/member/public', cache: 'no-store' });
  assert.equal(endpoint.keepUnusedDataFor, 0);
  assert.deepEqual(endpoint.transformResponse({ ...profile, phone: 'PRIVATE', email: 'PRIVATE', wallet: {}, stats: { bookingsAsPassenger: 3 } }), profile);
});

function fixture() {
  const hooks = hookHarness(), calls = [], state = { online: true, active: true };
  const read = { currentData: profile, refetch: async () => calls.push('refresh') };
  const { PublicMemberContent } = loader({ react: { ...React, ...hooks.react },
    'react-native': { ActivityIndicator: 'Spinner', Image: 'Image', ScrollView: 'Scroll', Text: 'Text', View: 'View', TouchableOpacity: 'Button', StyleSheet: { create: x => x } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' }, '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { useRouter: () => ({ canGoBack: () => false, replace: x => calls.push(x) }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/store/hooks': { useAppSelector: selector => selector({ zwangaApi: { config: { online: state.online } } }) },
    '@/services/tokenSession': { getTokenSessionVersion: () => 1 },
    '@/store/api/publicMemberApi': { useGetPublicMemberQuery: (args, options) => { state.args = args; state.options = options; return read; } },
    '@/hooks/navigation/useTripContactMessaging': { useContactMessaging: (contacts, _close, active) => {
      state.contacts = contacts; state.canMessage = active;
      return { isOpeningConversation: false, openMessage: async p => calls.push(['message', p]) };
    } },
  })('app/public-profile/[id].tsx');
  return { hooks, calls, state, read, render: () => hooks.render(() => PublicMemberContent({ id: 'member', viewerId: 'viewer', session: 1 })) };
}

test('profile displays public identity and reputation with an explicit internal message action', async () => {
  const m = fixture(), tree = m.render();
  assert.match(words(tree), /Camille Démo/);
  assert.match(words(tree), /4.5 \/ 5/);
  assert.match(words(tree), /Téléphone vérifié/);
  assert.deepEqual(m.state.args, { id: 'member', viewerId: 'viewer', session: 1 });
  assert.equal(m.state.options.pollingInterval, 0);
  assert.deepEqual(m.calls, []);
  await nodes(tree).find(n => n.type === 'Button' && words(n) === 'Écrire dans Zwanga').props.onPress();
  assert.equal(m.calls[0][1].id, 'member');
  assert.equal(m.calls[0][1].bookingId, undefined);
  assert.equal(nodes(tree).some(n => n.props.allowFontScaling === false || n.props.numberOfLines), false);
  m.hooks.unmount();
});

test('loading, failures, account mismatch and offline never display cached identities', () => {
  const m = fixture();
  for (const change of [{ isFetching: true }, { isError: true, error: { status: 403 } }, { isError: true, error: { status: 500 } }, { currentData: { ...profile, id: 'other' } }]) {
    Object.assign(m.read, { currentData: profile, isError: false, isFetching: false }, change);
    assert.doesNotMatch(words(m.render()), /Camille|Écrire dans Zwanga/);
    assert.equal(m.state.canMessage, false);
  }
  Object.assign(m.read, { currentData: profile, isError: false, isFetching: false });
  m.state.online = false;
  assert.match(words(m.render()), /Reconnectez-vous/);
  assert.doesNotMatch(words(m.render()), /Camille/);
  m.state.online = true; m.state.active = false;
  assert.doesNotMatch(words(m.render()), /Camille/);
  m.hooks.unmount();
});
