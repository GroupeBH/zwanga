const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}

test('trip filters remain compact; search expands on demand and closing it clears the hidden filter', () => {
  const hooks = hookHarness();
  const calls = [];
  let dismissals = 0;
  const props = {
    mainTab: 'published', subTab: 'upcoming', searchQuery: '',
    onMainTabChange: (tab) => { calls.push(['main', tab]); props.mainTab = tab; },
    onSubTabChange: (tab) => { calls.push(['sub', tab]); props.subTab = tab; },
    onSearchChange: (query) => { calls.push(['search', query]); props.searchQuery = query; },
    onPublish: () => calls.push(['publish']),
  };
  const native = {
    Keyboard: { dismiss: () => dismissals++ }, Platform: { OS: 'android' },
    Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', View: 'View',
  };
  const { TripsHeader } = loader({
    react: hooks.react,
    'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/constants/styles': { Colors: { white: '#fff', gray: { 500: '#aaa', 600: '#666', 700: '#444' } } },
    '@/features/screen-styles/app/tabs/trips': { styles: {} },
  })('features/trips/TripsHeader.tsx');
  const draw = () => nodes(hooks.render(() => TripsHeader(props)));
  let view = draw();
  assert.equal(view.some((node) => node.type === 'Input'), false);
  view.find((node) => node.props.accessibilityLabel === 'Rechercher dans mes trajets').props.onPress();
  view = draw();
  const input = view.find((node) => node.type === 'Input');
  assert.ok(input);
  input.props.onChangeText('Gombe');
  view = draw();
  view.find((node) => node.props.accessibilityLabel === 'Fermer la recherche').props.onPress();
  assert.equal(props.searchQuery, '');
  assert.equal(dismissals, 1);
  assert.equal(draw().some((node) => node.type === 'Input'), false);

  view = draw();
  view.find((node) => node.props.accessibilityRole === 'tab' && node.props.accessibilityState.selected === false &&
    nodes(node).some((child) => child.props.children === 'Réservations')).props.onPress();
  assert.deepEqual(calls.slice(-2), [['main', 'bookings'], ['sub', 'upcoming']]);
  view = draw();
  view.find((node) => node.props.accessibilityLabel === 'Publier un trajet').props.onPress();
  assert.deepEqual(calls.at(-1), ['publish']);
  hooks.unmount();
});

test('compact header keeps accessible targets and one conditional search row', () => {
  const native = { StyleSheet: { create: (value) => value } };
  const styles = loader({ 'react-native': native })('features/screen-styles/app/tabs/trips/container.styles.ts').styles;
  assert.ok(styles.headerPublishButton.minHeight >= 44);
  assert.ok(styles.subTab.minHeight >= 44);
  assert.ok(styles.searchToggle.width >= 44 && styles.searchToggle.height >= 44);
  assert.ok(styles.mainTab.minHeight >= 44);
  assert.ok(styles.searchClearButton.minWidth >= 44 && styles.searchClearButton.minHeight >= 44);
  assert.ok(styles.header.paddingTop <= 8);
});
