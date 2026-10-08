const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const all = node => !node || typeof node !== 'object' ? [] : [node,
  ...React.Children.toArray(node.props?.children).flatMap(all)];

for (const os of ['ios', 'android']) test(`${os}: rating is a regular screen, not another native modal above trip-end panels`, () => {
  const Stack = Object.assign(() => null, { Screen: 'Screen', Protected: 'Protected' });
  const { ProtectedAppStack } = loader({ react: React, 'expo-router': { Stack },
    'react-native': { Platform: { OS: os } },
    '@/store/selectors': { selectHasAuthenticatedSession: () => true },
    '@/store/hooks': { useAppSelector: fn => fn() },
    '@/hooks/navigation/useHomeRootNavigation': { useHomeRootNavigation: () => false },
  })('components/ProtectedAppStack.tsx');
  const screen = all(ProtectedAppStack()).find(node => node.props?.name === 'rate/[id]');
  assert.equal(screen.props.options.presentation, 'card');
});

test('the rating screen registers an active route scope for in-app dialogs and keeps keyboard taps usable', () => {
  const state = { active: true, ratingScopeKey: 'rating:driver:trip', activeTab: 'rate', rating: 0 };
  const Screen = loader({ react: React,
    'react-native': { View: 'View', ScrollView: 'ScrollView', Text: 'Text', TouchableOpacity: 'Button' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/constants/styles': { Colors: { gray: {}, primary: '', secondary: '' }, Spacing: {} },
    '@/utils/reanimated': { __esModule: true, default: { View: 'AnimatedView' } },
    '../../features/screen-styles/app/rate/detail/index': { styles: {} },
    '../../features/rating/RatingParticipantSelector': { RatingParticipantSelector: 'Participants' },
    '../../hooks/rating/useRatingData': { useRatingData: () => state },
    '../../hooks/rating/useRatingActions': { useRatingActions: () => ({}) },
    '@/features/navigation/RideOverlayProvider': { RideOverlayScope: 'Scope' },
  })('app/rate/[id].tsx').default;
  assert.equal(Screen().type, 'Scope'); assert.equal(Screen().props.scopeKey, state.ratingScopeKey);
  assert.equal(Screen().props.active, true);
  const scroll = all(Screen()).find(node => node.type === 'ScrollView');
  assert.equal(scroll.props.keyboardShouldPersistTaps, 'handled');
  state.active = false; assert.equal(Screen().props.active, false);
});

test('rating replaces driver navigation once, after cleanup and native map release; failed transitions can retry', () => {
  const hooks = hookHarness(), events = []; let navigate, recover, allowed = true;
  const foundation = { data: { tripId: 'trip', isScreenActive: true, router: { replace: path => events.push(path) } },
    refs: { isExitingRef: { current: false } }, exitActions: { cleanupNavigationUi: () => events.push('cleanup') },
    mapState: { navigateAfterRelease: (action, onRecovered) => {
      events.push('release'); navigate = action; recover = onRecovered; return allowed;
    } } };
  const { useDriverRatingTransition } = loader({ react: hooks.react })('hooks/driver-navigation/useDriverRatingTransition.ts');
  const press = () => hooks.render(() => useDriverRatingTransition(foundation))();
  press(); press(); assert.deepEqual(events, ['cleanup', 'release']);
  navigate(); assert.equal(events.at(-1), '/rate/trip');
  recover(); allowed = false; press(); assert.equal(foundation.refs.isExitingRef.current, false);
  allowed = true; press(); assert.equal(foundation.refs.isExitingRef.current, true);
  recover(); foundation.data.isScreenActive = false;
  const count = events.length; press(); assert.equal(events.length, count);
  foundation.data.isScreenActive = true; foundation.data.tripId = ''; press(); assert.equal(events.length, count);
  hooks.unmount();
});
