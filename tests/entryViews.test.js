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

test('sync status is a small non-modal banner, with an explicit action only when needed', () => {
  const f = fixture(); let actions = 0;
  const tree = f.EntrySyncBanner({ failed: false, offline: false, onAction: () => { actions++; } });
  assert.equal(tree.props.testID, 'entry-sync-banner');
  assert.equal(tree.props.accessibilityViewIsModal, undefined);
  assert.equal(tree.props.style[1].top, 96);
  assert.equal(nodes(tree).filter(node => node.type === 'Progress').length, 1);
  assert.equal(nodes(tree).filter(node => node.type === 'Button').length, 0);
  const retry = nodes(f.EntrySyncBanner({ failed: true, offline: false, onAction: () => { actions++; } }));
  assert.equal(retry.some(node => node.type === 'Progress'), false);
  retry.find(node => node.type === 'Button').props.onPress(); assert.equal(actions, 1);
});

test('offline status cannot retry a network read but can open an already proposed trip', () => {
  const f = fixture();
  const props = { failed: true, offline: true, onAction() {} };
  assert.equal(nodes(f.EntrySyncBanner(props)).find(node => node.type === 'Button').props.disabled, true);
  const resume = nodes(f.EntrySyncBanner({ ...props, actionLabel: 'Reprendre mon trajet' }));
  assert.equal(resume.find(node => node.type === 'Button').props.disabled, false);
  assert.ok(resume.some(node => node.type === 'Text' && node.props.children === 'Trajet en cours'));
});
