const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
const text = tree => nodes(tree).filter(n => n.type === 'Text').flatMap(n => n.props.children).filter(v => typeof v === 'string').join(' ');
const native = { StyleSheet: { create: value => value }, View: 'View', Text: 'Text', TextInput: 'Input',
  ScrollView: 'Scroll', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', RefreshControl: 'Refresh' };
function screenFixture(file, extra) {
  const hooks = hookHarness(), state = { active: true, session: 0 }, routes = [];
  const Screen = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    'react-native-safe-area-context': { SafeAreaView: 'Safe' }, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.session },
    'expo-router': { useRouter: () => ({ canGoBack: () => false, back: () => routes.push('back'), replace: p => routes.push(p), push: p => routes.push(p) }) },
    ...extra,
  })(file).default;
  return { hooks, state, routes, render: () => hooks.render(Screen) };
}
function recurring(t) {
  const action = deferred(), calls = [], query = { data: [{ id: 'template', status: 'active', weekdays: [1, 3],
    departure: { name: 'Start' }, arrival: { name: 'End' }, nextOccurrenceDate: 'invalid', endDate: 'invalid' }],
    isError: false, refetch() {} };
  const f = screenFixture('app/recurring-trips.tsx', {
    '../features/screen-styles/app/recurring-trips/index': { styles: {} },
    '@/services/analytics': { trackEvent: async () => { throw new Error('analytics offline'); } },
    '@/store/api/tripApi': { useGetMyRecurringTripsQuery: () => query,
      usePauseRecurringTripMutation: () => [id => { calls.push(id); return { unwrap: () => action.promise }; }],
      useResumeRecurringTripMutation: () => [() => ({ unwrap: () => action.promise })] },
  });
  t.after(() => f.hooks.unmount());
  return { ...f, action, calls, query, toggle: () => nodes(f.render()).find(n => n.type === 'Button' && text(n).includes('Mettre en pause')).props.onPress };
}
test('recurring trips: failed mutations are caught, duplicate taps send once, invalid dates do not crash rendering', async t => {
  const f = recurring(t), toggle = f.toggle();
  assert.match(text(f.render()), /Date indisponible/);
  const work = toggle(); await toggle(); assert.equal(f.calls.length, 1);
  f.action.reject({ status: 503 }); await work;
  assert.ok(nodes(f.render()).some(n => n.props.accessibilityRole === 'alert' && text(n).includes('Réessayez')));
  assert.equal(nodes(f.render()).find(n => n.type === 'Button' && text(n).includes('Mettre en pause')).props.disabled, false);
});
test('recurring trips: a query failure is not an empty list; late failures do not appear after leaving', async t => {
  const f = recurring(t), work = f.toggle()();
  f.state.active = false; f.render(); f.state.active = true; f.render();
  f.action.reject({ status: 500 }); await work;
  assert.equal(nodes(f.render()).some(n => n.props.accessibilityRole === 'alert'), false);
  f.query.data = []; f.query.isError = true;
  assert.match(text(f.render()), /Impossible de charger/); assert.doesNotMatch(text(f.render()), /Aucun trajet récurrent/);
});
test('recurring trips: a rejected analytics event does not invalidate a confirmed action', async t => {
  const f = recurring(t), work = f.toggle()(); f.action.resolve({}); await work;
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(nodes(f.render()).some(n => n.props.accessibilityRole === 'alert'), false);
});
function profile(t) {
  const update = deferred(), calls = [], dispatched = [];
  const f = screenFixture('app/edit-profile.tsx', {
    '../features/screen-styles/app/edit-profile/index': { styles: {} },
    '@/features/navigation/RideModal': { RideModal: 'Modal' }, '@/components/GenderSelector': { GenderSelector: 'Gender' },
    '@/hooks/useProfilePhoto': { useProfilePhoto: () => ({ changeProfilePhoto: async () => false }) },
    '@/utils/reanimated': { __esModule: true, default: { View: 'AnimatedView' }, FadeInDown: { delay: () => ({}) } },
    '@/store/hooks': { useAppDispatch: () => v => dispatched.push(v) }, '@/store/slices/authSlice': { updateUser: v => v },
    '@/store/api/userApi': {
      useGetProfileSummaryQuery: () => ({ data: { user: { id: 'user', firstName: 'Test', lastName: 'Example' } }, refetch() {} }),
      useGetKycStatusQuery: () => ({ data: {} }),
      useUpdateUserMutation: () => [v => { calls.push(v); return { unwrap: () => update.promise }; }, {}],
    },
  });
  t.after(() => f.hooks.unmount()); f.render();
  return { ...f, update, calls, dispatched, save: () => nodes(f.render()).find(n => n.type === 'Button' && text(n) === 'Enregistrer').props.onPress,
    modal: () => nodes(f.render()).find(n => n.type === 'Modal') };
}
test('profile feedback: no native modal, back dismisses, navigation waits for dismissal and runs once', async t => {
  const f = profile(t), save = f.save(), work = save(); await save(); assert.equal(f.calls.length, 1);
  f.update.resolve({ id: 'user', firstName: 'Test', lastName: 'Example' }); await work;
  assert.equal(f.modal().props.inApp, true); assert.equal(f.modal().props.visible, true);
  nodes(f.modal()).find(n => n.type === 'Button' && text(n) === 'OK').props.onPress();
  assert.deepEqual(f.routes, []); assert.equal(f.modal().props.visible, false);
  f.modal().props.onDismiss(); f.modal().props.onDismiss(); assert.deepEqual(f.routes, ['/(tabs)/profile']);
});
test('profile feedback: leaving before success updates the account, never reopens stale feedback', async t => {
  const f = profile(t), work = f.save()();
  f.state.active = false; f.render(); f.state.active = true; f.render();
  f.update.resolve({ id: 'user' }); await work;
  assert.equal(f.dispatched.length, 1); assert.equal(f.modal().props.visible, false); assert.deepEqual(f.routes, []);
});
test('profile feedback: Android back closes an error without leaving the screen', async t => {
  const f = profile(t), work = f.save()(); f.update.reject({ status: 500 }); await work;
  assert.equal(f.modal().props.visible, true); f.modal().props.onRequestClose();
  assert.equal(f.modal().props.visible, false); f.modal().props.onDismiss(); assert.deepEqual(f.routes, []);
});
