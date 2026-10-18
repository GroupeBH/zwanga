const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const nodes = node => Array.isArray(node) ? node.flatMap(nodes) :
  React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];

function screen(t, canGoBack = true) {
  const hooks = hookHarness(), calls = [];
  const state = { focused: true, canGoBack };
  const router = {
    canGoBack: () => { calls.push('check'); return state.canGoBack; },
    back: () => calls.push('back'), replace: path => calls.push(['replace', path]),
    push: path => calls.push(['push', path]),
  };
  const feed = { activeBookings: [], displayBookings: [], isLoading: false, isFetching: false, isError: false,
    loadingMore: false, hasMore: false, refetch: () => calls.push('refresh') };
  const { default: BookingsScreen } = loader({
    '@/features/navigation/NavigationContactModal': { NavigationContactModal: 'ContactModal' },
    '@/store/hooks': { useAppSelector: selector => selector({ auth: { user: { id: 'passenger' } } }) },
    react: { ...React, ...hooks.react },
    'expo-router': { useRouter: () => router },
    '@react-navigation/native': { useFocusEffect: callback => hooks.react.useEffect(
      () => state.focused ? callback() : undefined, [callback, state.focused]) },
    'react-native': { Platform: { OS: 'ios' }, StyleSheet: { create: value => value },
      ActivityIndicator: 'Spinner', FlatList: 'List', Modal: 'Modal', RefreshControl: 'Refresh', Text: 'Text',
      TouchableOpacity: 'Button', View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { __esModule: true, default: { View: 'AnimatedView' }, FadeInDown: {} },
    '../hooks/bookings/useBookingCards': { useBookingCards: () => ({ renderBookingListItem() {} }) },
    '@/hooks/bookings/useBookingsFeed': { useBookingsFeed: () => feed },
    '@/components/ui/HistoryPaginationFooter': { HistoryPaginationFooter: 'Footer' },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => calls.push(['dialog', value]) }) },
    '@/services/analytics': { trackEvent: async () => {} },
    '@/store/api/bookingApi': { useCancelBookingMutation: () => [() => { throw Error('Back must not cancel a booking'); }, {}] },
    '@/utils/errorHelpers': { getApiErrorMessage: (_, fallback) => fallback },
    '@/utils/phoneHelpers': { openWhatsApp: async () => { throw Error('Back must not contact a driver'); } },
  })('app/bookings.tsx');
  const render = () => hooks.render(BookingsScreen);
  const button = tree => nodes(tree).find(node => node.props.accessibilityLabel === 'Retour');
  t.after(() => hooks.unmount());
  return { state, calls, hooks, render, button };
}

test('reservation list Back preserves ordinary navigation when a previous screen exists', t => {
  const app = screen(t); const button = app.button(app.render());
  assert.equal(button.props.accessibilityRole, 'button'); assert.deepEqual(app.calls, []);
  button.props.onPress(); assert.deepEqual(app.calls, ['check', 'back']);
});

test('a directly opened reservation list replaces itself with Home instead of dispatching an unhandled GO_BACK', t => {
  const app = screen(t, false); app.button(app.render()).props.onPress();
  assert.deepEqual(app.calls, ['check', ['replace', '/(tabs)']]);
});

test('the current history is checked at the tap, not captured when the list mounted', t => {
  const app = screen(t); const back = app.button(app.render()).props.onPress;
  app.state.canGoBack = false; back();
  assert.deepEqual(app.calls, ['check', ['replace', '/(tabs)']]);
});

for (const canGoBack of [true, false]) test(`rapid taps and refresh renders queue only one exit (history=${canGoBack})`, t => {
  const app = screen(t, canGoBack); const back = app.button(app.render()).props.onPress;
  back(); back(); app.button(app.render()).props.onPress();
  assert.deepEqual(app.calls, canGoBack ? ['check', 'back'] : ['check', ['replace', '/(tabs)']]);
});

test('the exit lock is reset when the same reservation screen is visited again', t => {
  const app = screen(t); app.button(app.render()).props.onPress();
  app.state.focused = false; app.render(); app.state.focused = true; app.state.canGoBack = false;
  app.button(app.render()).props.onPress();
  assert.deepEqual(app.calls, ['check', 'back', 'check', ['replace', '/(tabs)']]);
});

for (const event of ['blur', 'unmount']) test(`a delayed tap after ${event} cannot navigate another screen`, t => {
  const app = screen(t); const back = app.button(app.render()).props.onPress;
  if (event === 'blur') { app.state.focused = false; app.render(); } else app.hooks.unmount();
  back(); assert.deepEqual(app.calls, []);
});
