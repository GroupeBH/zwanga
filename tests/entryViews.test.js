const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
}
function fixture() {
  const routes = [];
  const load = loader({
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ScrollView: 'Scroll',
      ActivityIndicator: 'Progress', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea', useSafeAreaInsets: () => ({ top: 32 }) },
    'expo-router': { useRouter: () => ({ push: path => routes.push(path) }) },
  });
  return { routes, ...load('components/home/EntrySyncBanner.tsx'), ...load('components/home/HomeEntryPlaceholder.tsx') };
}

test('unknown-role Home is scrollable and offers only neutral destinations without a map or role actions', () => {
  const f = fixture(), tree = f.HomeEntryPlaceholder({ failed: false, fetching: true, onRetry() {} });
  const rendered = nodes(tree);
  assert.equal(tree.props.testID, 'home-entry-placeholder');
  assert.ok(rendered.some(node => node.type === 'Scroll'));
  const buttons = rendered.filter(node => node.type === 'Button');
  assert.equal(buttons.length, 3); buttons.forEach(button => button.props.onPress());
  assert.deepEqual(f.routes, ['/trips', '/profile', '/support']);
  const copy = rendered.filter(node => node.type === 'Text').map(node => node.props.children).join(' ');
  assert.doesNotMatch(copy, /passager|conducteur|publier|accepter|commander/i);
});

test('neutral Home keeps retry inline and disables it during an existing read', () => {
  const f = fixture(); let attempts = 0;
  const props = { failed: true, fetching: false, onRetry: () => { attempts++; } };
  const button = nodes(f.HomeEntryPlaceholder(props)).filter(node => node.type === 'Button').at(-1);
  assert.equal(button.props.disabled, false); button.props.onPress(); assert.equal(attempts, 1);
  assert.equal(nodes(f.HomeEntryPlaceholder({ ...props, fetching: true })).filter(node => node.type === 'Button').at(-1).props.disabled, true);
});

test('Home hides background sync progress, failure and offline status without reserving space', () => {
  const f = fixture(); let actions = 0;
  for (const failed of [false, true]) for (const offline of [false, true]) {
    assert.equal(f.EntrySyncBanner({ failed, offline, onAction: () => { actions++; } }), null);
  }
  assert.equal(actions, 0, 'hiding a status must not trigger a retry or navigation');
});

test('verified activities remain accessible, including after an offline or failed sync', () => {
  const f = fixture(); let actions = 0;
  for (const actionLabel of ['Reprendre mon trajet', 'Voir la réservation', 'Voir la demande']) {
    const tree = f.EntrySyncBanner({ failed: true, offline: true, actionLabel, onAction: () => { actions++; } });
    assert.equal(tree.props.testID, 'entry-sync-banner');
    assert.equal(tree.props.accessibilityViewIsModal, undefined);
    assert.equal(tree.props.style.position, undefined, 'activity never covers a map priority');
    assert.equal(tree.props.style.zIndex, undefined);
    const rendered = nodes(tree);
    assert.equal(rendered.some(node => node.type === 'Progress'), false);
    const buttons = rendered.filter(node => node.type === 'Button');
    assert.equal(buttons.length, 1);
    assert.notEqual(buttons[0].props.disabled, true);
    buttons[0].props.onPress();
    assert.ok(rendered.some(node => node.type === 'Text' && node.props.children === actionLabel));
    assert.ok(rendered.some(node => node.type === 'Text' && node.props.children ===
      (actionLabel === 'Reprendre mon trajet' ? 'Trajet en cours' : 'Une demande à consulter')));
  }
  assert.equal(actions, 3);
});
