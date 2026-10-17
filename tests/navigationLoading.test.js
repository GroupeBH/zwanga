const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree) ? tree.map(text).join('') : text(tree?.props?.children ?? '');

function fixture(t, props = {}) {
  const hooks = hookHarness(), state = { active: true, exits: 0 };
  const { NavigationLoading } = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button', StyleSheet: { create: value => value } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/components/home/HomeRideLoaderVisual': { HomeRideLoaderVisual: 'Journey' },
  })('features/navigation/NavigationLoading.tsx');
  t.after(() => hooks.unmount());
  return { state, hooks, render: () => hooks.render(() => NavigationLoading({ onExit: () => state.exits++, ...props })) };
}

test('guidance loader explains the wait, remains scrollable and can exit immediately', t => {
  const e = fixture(t), tree = e.render();
  assert.match(text(tree), /Ouverture de votre trajet/);
  assert.ok(nodes(tree).some(n => n.type === 'Scroll'));
  assert.ok(nodes(tree).some(n => n.props.accessibilityRole === 'progressbar' && n.props.accessibilityState.busy));
  assert.equal(nodes(tree).find(n => n.type === 'Journey').props.running, true);
  nodes(tree).find(n => n.type === 'Button').props.onPress(); assert.equal(e.state.exits, 1);
  e.state.active = false;
  const paused = e.render();
  assert.equal(nodes(paused).find(n => n.type === 'Journey').props.running, false);
  const exit = nodes(paused).find(n => n.type === 'Button');
  assert.equal(exit.props.disabled, true); exit.props.onPress(); assert.equal(e.state.exits, 1);
});

test('a long wait gives a connection hint, without a fake error or a new request', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const e = fixture(t);
  e.render(); t.mock.timers.tick(7999); assert.doesNotMatch(text(e.render()), /plus de temps/);
  t.mock.timers.tick(1); assert.match(text(e.render()), /Vérifiez votre connexion/);
  assert.equal(nodes(e.render()).filter(n => n.type === 'Button').length, 1);
});

test('inactive/unmounted loader clears its timer and compact map wait stays non-blocking', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const e = fixture(t, { compact: true, onExit: undefined, label: 'Préparation de la carte' });
  const tree = e.render();
  assert.equal(tree.type, 'View'); assert.match(text(tree), /Préparation de la carte/);
  assert.equal(nodes(tree).some(n => n.type === 'Button'), false);
  e.state.active = false; e.render(); t.mock.timers.tick(9000);
  assert.doesNotMatch(text(e.render()), /plus de temps/);
  e.hooks.unmount();
});

test('access, driver, passenger and map placeholders all use the shared loader', () => {
  for (const file of ['components/trip/DriverTripAccessGuard.tsx', 'app/trip/navigate/[id].tsx', 'app/booking/navigate/[id].tsx']) {
    assert.match(fs.readFileSync(file, 'utf8'), /<NavigationLoading/);
  }
  for (const file of ['app/trip/navigate/[id].tsx', 'app/booking/navigate/[id].tsx']) {
    assert.match(fs.readFileSync(file, 'utf8'), /<NavigationLoading compact label="Préparation de la carte"/);
  }
});
