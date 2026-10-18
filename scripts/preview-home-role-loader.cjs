/* global __dirname */
// Static previews of the actual components, not a parallel mockup. No API/GPS.
// Native animation is sampled at its midpoint; this is not an on-device test.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement;
const { HOME_LOADER_WAYPOINTS } = loader()('features/home/homeLoaderJourney.ts');
const point = HOME_LOADER_WAYPOINTS[24];
const svg = Object.fromEntries(['Circle', 'G', 'Path', 'Rect'].map(name => [name,
  props => h(name.toLowerCase(), props)]));
const load = loader({
  'react-native': { ...native, Animated: { View: native.View } },
  'react-native-svg': { __esModule: true, ...svg, default: props => h('svg', props) },
  'react-native-safe-area-context': { SafeAreaView: ({ edges: _edges, ...props }) => h(native.View, props) },
  '@expo/vector-icons': { Ionicons: ({ color, size }) => h('span', { style: { color, fontSize: size } }, '↻') },
  '@/hooks/home/useHomeLoaderMotion': { useHomeLoaderMotion: () => ({
    car: { opacity: 1, transform: [{ translateX: point.x }, { translateY: point.y }, { rotate: point.heading }] },
    halo: { opacity: 0.18, transform: [{ scale: 1 }] },
  }) },
});
const { HomeRoleLoader } = load('components/home/HomeRoleLoader.tsx');
const directory = path.resolve(__dirname, '../.expo/home-role-loader-preview');
fs.mkdirSync(directory, { recursive: true });
for (const [name, width, height, failed] of [
  ['phone', 390, 760, false], ['small', 320, 568, false], ['error', 390, 760, true],
]) {
  const markup = renderToStaticMarkup(h(native.View, { style: { width, height } },
    h(HomeRoleLoader, { failed, active: true, retrying: false, onRetry() {} })));
  const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zwanga — aperçu du loader</title><style>${native.StyleSheet.getSheet().textContent}body{margin:0;background:#FFFBF7;font-family:Arial,sans-serif}</style>${markup}</html>`;
  const target = path.join(directory, `${name}.html`);
  fs.writeFileSync(target, html);
  console.log(target);
}
