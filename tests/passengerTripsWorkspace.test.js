const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = x => Array.isArray(x) ? x.flatMap(nodes) : React.isValidElement(x) ? [x, ...nodes(x.props.children)] : [];

test('passengers load their bookings and history, never publication-only endpoints even after a role change', () => {
  const hooks = hookHarness(), reads = [];
  const state = { auth: { user: { id: 'fixture', role: 'passenger' } } };
  const { useTripsScreenState } = loader({
    react: hooks.react,
    '@/store/hooks': { useAppSelector: fn => fn(state) },
    'expo-router': { useRouter: () => ({}) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 24 }) },
    '@/contexts/TutorialContext': { useTutorialGuide: () => ({ shouldShow: false }) },
    './useTripEditReferences': { useTripEditReferences: () => ({}) },
    './useTripsFeeds': { useTripsFeeds: (...args) => { reads.push(['feed', ...args]); return {}; } },
    '@/store/api/tripApi': {
      useDeleteTripMutation: () => [() => {}, {}], useUpdateTripMutation: () => [() => {}, {}],
      useGetMyRecurringTripsQuery: (_, options) => { reads.push(['recurring', options.skip]); return {}; },
    },
    '@/store/api/vehicleApi': { useGetVehiclesQuery: (_, options) => { reads.push(['vehicles', options.skip]); return {}; } },
  })('hooks/trips/useTripsScreenState.ts');
  let model = hooks.render(useTripsScreenState);
  assert.equal(model.mainTab, 'bookings');
  assert.deepEqual(reads, [['feed', 'bookings', 'upcoming', ''], ['recurring', true], ['vehicles', true]]);
  model.setSubTab('completed'); model.setSearchQuery('Gare'); reads.length = 0;
  model = hooks.render(useTripsScreenState);
  assert.deepEqual(reads[0], ['feed', 'bookings', 'completed', 'Gare']);
  state.auth.user.role = 'driver'; reads.length = 0;
  model = hooks.render(useTripsScreenState);
  assert.equal(model.mainTab, 'published');
  assert.deepEqual(reads.slice(1), [['recurring', false], ['vehicles', false]]);
  state.auth.user.role = 'passenger';
  model.setMainTab('published');
  assert.equal(hooks.render(useTripsScreenState).mainTab, 'bookings');
  hooks.unmount();
});

test('passenger header retains search and history without Publish, Published or earnings actions', () => {
  const hooks = hookHarness(), selected = [];
  const { TripsHeader } = loader({ react: hooks.react,
    'react-native': { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button',
      Platform: { OS: 'android' }, StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/screen-styles/app/tabs/trips': { styles: {} },
  })('features/trips/TripsHeader.tsx');
  const tree = hooks.render(() => TripsHeader({ mainTab: 'bookings', subTab: 'upcoming', searchQuery: '',
    onSubTabChange: v => selected.push(v), onMainTabChange: () => assert.fail('driver-only'), onSearchChange() {} }));
  const all = nodes(tree);
  assert.deepEqual(all.filter(n => n.props.accessibilityRole === 'tab').map(n => nodes(n).find(x => x.type === 'Text').props.children), ['À venir', 'Historique']);
  assert.equal(all.some(n => n.props.accessibilityLabel === 'Publier un trajet'), false);
  assert.ok(all.some(n => n.props.accessibilityLabel === 'Rechercher dans mes trajets'));
  all.find(n => n.props.accessibilityRole === 'tab' && !n.props.accessibilityState.selected).props.onPress();
  assert.deepEqual(selected, ['completed']);
  hooks.unmount();
});
