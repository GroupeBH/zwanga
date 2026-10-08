const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { Text: 'Text', View: 'View', TextInput: 'Input', Switch: 'Switch', TouchableOpacity: 'Button', StyleSheet: { create: x => x, hairlineWidth: 1 } };
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const words = tree => nodes(tree).filter(n => n.type === 'Text').flatMap(n => n.props.children).filter(v => typeof v === 'string').join(' ');

function paymentFixture() {
  const hooks = hookHarness(), paths = [];
  let refreshes = 0;
  const response = { currentData: { cash: { enabled: true, moneyPerToken: 100, availableTokens: 5 } }, isFetching: false, isError: false, refetch: () => { refreshes++; } };
  const props = { value: ['electronic', 'points'], price: 10000, onChange: update => { props.value = update(props.value); } };
  const Component = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    'expo-router': { useRouter: () => ({ push: path => paths.push(path) }) },
    '@/store/hooks': { useAppSelector: () => ({ id: 'test-driver' }) }, '@/store/selectors': {},
    '@/store/api/driverFinanceApi': { useDriverFinanceSummaryQuery: () => response },
  })('features/publish/PublishPaymentModes.tsx').PublishPaymentModes;
  return { props, response, paths, refreshes: () => refreshes, render: () => hooks.render(() => Component(props)) };
}

test('compact payment choices keep the commission visible and reveal full terms on demand', () => {
  const f = paymentFixture(); let tree = f.render();
  assert.match(words(tree), /Commission 5 %/);
  assert.doesNotMatch(words(tree), /sans débiter|revérifiée/);
  const boxes = nodes(tree).filter(n => n.props.accessibilityRole === 'checkbox');
  assert.equal(boxes.length, 3);
  assert.deepEqual(boxes.map(n => n.props.accessibilityLabel), ['Paiement électronique', 'Jetons Zwanga', 'Espèces (cash)']);
  const disclosure = nodes(tree).find(n => n.props.accessibilityState?.expanded === false);
  assert.ok(disclosure.props.style.minHeight >= 44);
  disclosure.props.onPress(); tree = f.render();
  assert.match(words(tree), /sans débiter votre portefeuille/);
  assert.match(words(tree), /réservés sur vos jetons achetés à l’acceptation/);
  nodes(tree).find(n => n.props.accessibilityState?.expanded === true).props.onPress();
  assert.doesNotMatch(words(f.render()), /sans débiter/);
});

test('cash failure, loading and insufficient reserve are distinct; wallet and refresh stay available', () => {
  const f = paymentFixture(); f.response.currentData.cash.availableTokens = 0;
  let tree = f.render(); assert.match(words(tree), /rechargez/);
  nodes(tree).find(n => n.type === 'Button' && words(n) === 'Recharger').props.onPress();
  assert.deepEqual(f.paths, ['/wallet']);
  nodes(tree).find(n => n.props.accessibilityLabel === 'Actualiser la disponibilité du cash').props.onPress();
  assert.equal(f.refreshes(), 1);
  f.response.isError = true; tree = f.render();
  assert.match(words(tree), /vérification indisponible/); assert.doesNotMatch(words(tree), /rechargez/);
  f.response.isFetching = true; tree = f.render();
  assert.match(words(tree), /Vérification du cash/);
  assert.equal(nodes(tree).find(n => n.props.accessibilityLabel === 'Actualiser la disponibilité du cash').props.disabled, true);
});

test('cash selection still uses the entered price and can be removed if eligibility changes', () => {
  const f = paymentFixture();
  const cash = () => nodes(f.render()).find(n => n.props.accessibilityLabel === 'Espèces (cash)');
  assert.equal(cash().props.disabled, false);
  f.props.price = 20000; assert.equal(cash().props.disabled, true);
  f.props.price = 10000; cash().props.onPress();
  assert.ok(f.props.value.includes('cash'));
  assert.match(words(f.render()), /commission réservée sur vos jetons achetés/);
  f.response.isError = true;
  assert.equal(cash().props.disabled, false, 'a selected choice remains removable');
  cash().props.onPress(); assert.ok(!f.props.value.includes('cash'));
});

test('places and price precede payment; free-trip switch retains its pricing behavior', () => {
  const props = { price: '2000', seats: '4', isFreeTrip: false, acceptedPaymentModes: ['points'],
    setPrice: next => { props.price = next; }, setIsFreeTrip: next => { props.isFreeTrip = next; } };
  const Component = loader({ 'react-native': native, '@/utils/reanimated': { default: { View: 'Animated.View' } },
    './PublishSeatSelector': { PublishSeatSelector: 'Seats' }, './PublishPaymentModes': { PublishPaymentModes: 'Payments' },
    './PublishPassengerOptions': { PublishPassengerOptions: 'Options' },
  })('features/publish/PublishPricingStep.tsx').PublishPricingStep;
  let tree = Component(props), list = nodes(tree);
  assert.ok(list.findIndex(n => n.type === 'Seats') < list.findIndex(n => n.type === 'Payments'));
  assert.ok(list.findIndex(n => n.type === 'Input') < list.findIndex(n => n.type === 'Payments'));
  assert.equal(list.find(n => n.type === 'Input').props.style.minWidth, 0, 'price shrinks inside narrow rows');
  const toggle = list.find(n => n.type === 'Switch'); toggle.props.onValueChange(true);
  assert.equal(props.price, ''); list = nodes(Component(props));
  assert.equal(list.find(n => n.type === 'Input').props.editable, false);
  assert.ok(!list.some(n => n.type === 'Payments'));
  list.find(n => n.type === 'Switch').props.onValueChange(false);
  assert.ok(nodes(Component(props)).some(n => n.type === 'Payments'));
  assert.ok(!nodes(Component(props)).some(n => n.type === 'Button'), 'only the parent fixed footer owns navigation');
});

test('optional note expands without losing text; passenger identity toggle is always reachable', () => {
  const hooks = hookHarness();
  const props = { requiresPassengerKyc: false, description: '',
    setRequiresPassengerKyc: value => { props.requiresPassengerKyc = value; },
    setDescription: value => { props.description = value; } };
  const Component = loader({ react: { ...React, ...hooks.react }, 'react-native': native })('features/publish/PublishPassengerOptions.tsx').PublishPassengerOptions;
  const render = () => hooks.render(() => Component(props));
  assert.ok(!nodes(render()).some(n => n.type === 'Input'));
  nodes(render()).find(n => n.type === 'Switch').props.onValueChange(true);
  assert.match(words(render()), /Identité vérifiée/);
  nodes(render()).find(n => n.type === 'Button').props.onPress();
  nodes(render()).find(n => n.type === 'Input').props.onChangeText('Petit bagage accepté');
  nodes(render()).find(n => n.type === 'Button').props.onPress();
  assert.equal(props.description, 'Petit bagage accepté');
  nodes(render()).find(n => n.type === 'Button').props.onPress();
  assert.equal(nodes(render()).find(n => n.type === 'Input').props.value, props.description);
  hooks.unmount();
});
