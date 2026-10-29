const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const nodes = node => Array.isArray(node) ? node.flatMap(nodes)
  : React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
const flatten = style => Object.assign({}, ...(Array.isArray(style) ? style : [style]));
const luminance = hex => hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
  .map(x => x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)
  .reduce((sum, x, i) => sum + x * [0.2126, 0.7152, 0.0722][i], 0);
function setup(os = 'android') {
  const hooks = hookHarness();
  const load = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', Image: 'Image',
      ActivityIndicator: 'Loader', Platform: { OS: os }, StyleSheet: { create: s => s } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/features/navigation/RideModal': { RideModal: 'Modal' },
    '@/features/navigation/RideOverlayProvider': { RideOverlayProvider: 'Overlays' },
    '@/features/navigation/rideOverlayStore': { RIDE_OVERLAY_PRIORITY: { confirmation: 100 } },
    '@/utils/errorHelpers': { getApiErrorMessage: error => error.message },
  });
  const { DialogProvider } = load('components/ui/DialogProvider.tsx');
  const draw = () => hooks.render(() => DialogProvider({ children: null }));
  const show = options => { draw().props.value.showDialog(options); return draw(); };
  return { draw, show };
}
const buttons = tree => nodes(tree).filter(n => n.type === 'Button');
const modal = tree => nodes(tree).find(n => n.type === 'Modal');

test('every dialog action has an opaque background, readable text and a 48px touch target', () => {
  const { show } = setup();
  const variants = ['primary', 'danger', 'destructive', 'secondary', 'ghost', undefined];
  const expected = ['#D1430F', '#DC2626', '#DC2626', '#E9ECEF', '#F1F3F5', '#D1430F'];
  const tree = show({ title: 'Confirmation', actions: variants.map((variant, i) => ({ label: `Action ${i}`, variant })) });
  buttons(tree).forEach((button, i) => {
    const style = flatten(button.props.style);
    const label = nodes(button).find(n => n.type === 'Text');
    const color = flatten(label.props.style).color;
    assert.equal(style.backgroundColor, expected[i]);
    assert.ok(style.minHeight >= 48);
    assert.equal(button.props.accessibilityRole, 'button');
    assert.deepEqual(button.props.accessibilityState, { disabled: false, busy: false });
    const [light, dark] = [luminance(color), luminance(style.backgroundColor)].sort((a, b) => b - a);
    assert.ok((light + 0.05) / (dark + 0.05) >= 4.5, `${variants[i]} contrast`);
  });
});

test('loading stays readable and other actions remain disabled until completion', async () => {
  for (const variant of ['primary', 'danger', 'destructive', 'secondary', 'ghost', undefined]) {
    const { show, draw } = setup();
    let finish;
    const pending = new Promise(resolve => { finish = resolve; });
    let calls = 0;
    const tree = show({ title: 'Action', actions: [
      { label: 'Annuler', variant: 'ghost' },
      { label: 'Continuer', variant, autoClose: false, onPress: () => { calls++; return pending; } },
    ] });
    buttons(tree)[1].props.onPress();
    const running = buttons(draw());
    assert.ok(running.every(b => b.props.disabled));
    assert.equal(running[1].props.accessibilityState.busy, true);
    const spinner = nodes(running[1]).find(n => n.type === 'Loader');
    const label = nodes(running[1]).find(n => n.type === 'Text');
    assert.equal(spinner.props.color, flatten(label.props.style).color);
    running[1].props.onPress(); assert.equal(calls, 1);
    finish(); await pending; await Promise.resolve();
    assert.ok(buttons(draw()).every(b => !b.props.disabled));
  }
});

for (const os of ['android', 'ios']) {
  test(`${os}: cancel is harmless and confirmation preserves native dismissal sequencing`, async () => {
    const { show, draw } = setup(os);
    let calls = 0;
    const options = { title: 'Supprimer ?', variant: 'danger', actions: [
      { label: 'Annuler', variant: 'ghost' },
      { label: 'Supprimer', variant: 'destructive', onPress: () => { calls++; } },
    ] };
    buttons(show(options))[0].props.onPress();
    assert.equal(modal(draw()).props.visible, false); assert.equal(calls, 0);
    buttons(show(options))[1].props.onPress();
    assert.equal(modal(draw()).props.visible, false);
    assert.equal(calls, os === 'ios' ? 0 : 1);
    modal(draw()).props.onDismiss(); await Promise.resolve();
    assert.equal(calls, 1);
    modal(draw()).props.onDismiss(); assert.equal(calls, 1);
  });
}
