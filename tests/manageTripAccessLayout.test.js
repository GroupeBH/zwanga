const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');

const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node)
  ? node.flatMap(all) : [node, ...all(node.props?.children)];
const flat = style => Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]).filter(Boolean));

function environment(overrides = {}) {
  const calls = [];
  const model = {
    trip: { id: 'test-trip', status: 'upcoming' }, routeEditor: {}, tracking: { visibleBookings: [] },
    state: { tripId: 'test-trip', isOwner: true, isIdentityVerified: false,
      insets: { bottom: 0 }, goHome: () => calls.push('home'),
      router: { push: route => calls.push(route) }, ...overrides },
  };
  const load = loader({
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', TextInput: 'Input',
      ActivityIndicator: 'Spinner', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/utils/reanimated': { default: { View: 'AnimatedView' }, FadeInDown: {} },
    '../../../hooks/manage-trip/useManageTripController': { useManageTripController: () => model },
    '@/components/trip/DriverTripAccessGuard': { DriverTripAccessGuard: 'AccessGuard' },
    '@/features/trip-detail/tripDetailAvailability': { isTripExpired: () => false },
    '../../../features/manage-trip/ManageTripContent': { ManageTripContent: 'TripContent' },
    '../../../features/manage-trip/ManageTripActionsFooter': { ManageTripActionsFooter: 'TripFooter' },
    '@/features/manage-trip/ManageTripContactModal': { ManageTripContactModal: 'ContactModal' },
    '@/features/navigation/RideOverlayProvider': { RideOverlayScope: 'OverlayScope' },
    '@/components/forms/FormLayout': { FormModal: 'Modal' },
  });
  const Screen = load('app/trip/manage/[id].tsx').default;
  return { calls, model, load, render() {
    const guard = Screen();
    assert.equal(guard.type, 'AccessGuard', 'driver access guard is preserved');
    return guard.props.children.type();
  } };
}

function compactButton(tree, label) {
  const button = all(tree).find(node => node.type === 'Button');
  assert.ok(button);
  const style = flat(button.props.style);
  assert.equal(style.flex ?? 0, 0, 'standalone actions must not grow vertically');
  assert.equal(style.flexGrow ?? 0, 0);
  assert.equal(style.width, '100%');
  assert.ok(style.maxWidth <= 400, 'width remains bounded on tablets');
  assert.ok(style.minHeight >= 48, 'usable touch target');
  assert.equal(style.height, undefined, 'large text may wrap without clipping');
  assert.ok(style.paddingHorizontal >= 16);
  const text = all(button).find(node => node.type === 'Text');
  assert.equal(text.props.children, label);
  assert.equal(flat(text.props.style).textAlign, 'center');
  assert.equal(flat(text.props.style).flexShrink, 1);
  assert.equal(text.props.numberOfLines, undefined);
  assert.notEqual(text.props.allowFontScaling, false);
  assert.equal(button.props.accessibilityRole, 'button');
  return button;
}

test('existing owned trips remain accessible regardless of identity snapshot availability', () => {
  const env = environment();
  for (const isIdentityVerified of [undefined, false, true]) {
    env.model.state.isIdentityVerified = isIdentityVerified;
    for (const status of ['upcoming', 'ongoing', 'completed', 'cancelled']) {
      env.model.trip.status = status;
      const nodes = all(env.render());
      assert.equal(nodes.filter(node => node.type === 'TripContent').length, 1);
      assert.equal(nodes.filter(node => node.type === 'TripFooter').length, 1);
      assert.equal(nodes.some(node => node.props?.children === 'Vérifier mon identité'), false);
    }
  }
  assert.deepEqual(env.calls, [], 'opening a trip must not redirect to verification');
});

test('denied access uses the same compact layout and only returns home', () => {
  const env = environment({ isOwner: false });
  const tree = env.render();
  compactButton(tree, 'Retour').props.onPress();
  assert.equal(all(tree).filter(node => node.type === 'TripContent').length, 0);
  assert.deepEqual(env.calls, ['home']);
});

test('verified owner retains the trip content, footer and shared row button dimensions', () => {
  const env = environment({ isIdentityVerified: true });
  const tree = env.render();
  assert.equal(all(tree).filter(node => node.type === 'TripContent').length, 1);
  assert.equal(all(tree).filter(node => node.type === 'TripFooter').length, 1);
  const { styles } = env.load('features/screen-styles/app/trip/manage/detail/index.ts');
  assert.equal(styles.primaryButton.flex, 1, 'do not change footer row sizing');
  assert.equal(styles.primaryButton.height, 54);
});

test('loading and missing trip states expose no identity or trip mutation button', () => {
  const env = environment();
  env.model.trip = null;
  for (const tripLoading of [true, false]) {
    env.model.state.tripLoading = tripLoading;
    const nodes = all(env.render());
    assert.equal(nodes.filter(node => node.type === 'Button').length, 0);
    assert.equal(nodes.filter(node => node.type === 'Spinner').length, tripLoading ? 1 : 0);
  }
});
