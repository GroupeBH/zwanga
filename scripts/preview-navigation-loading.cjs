/* global __dirname */
// Real components, native motion sampled midway. No API, GPS or user session.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement;
const { HOME_LOADER_WAYPOINTS } = loader()('features/home/homeLoaderJourney.ts');
const point = HOME_LOADER_WAYPOINTS[24];
const svg = Object.fromEntries(['Circle', 'G', 'Path', 'Rect'].map(name => [name, props => h(name.toLowerCase(), props)]));
const { NavigationLoading } = loader({
  'react-native': { ...native, Animated: { View: native.View } },
  'react-native-svg': { __esModule: true, ...svg, default: props => h('svg', props) },
  'react-native-safe-area-context': { SafeAreaView: ({ style, ...props }) => h(native.View, { ...props, style: [style, { paddingTop: 24, paddingBottom: 24 }] }) },
  '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
  '@/hooks/home/useHomeLoaderMotion': { useHomeLoaderMotion: () => ({
    car: { opacity: 1, transform: [{ translateX: point.x }, { translateY: point.y }, { rotate: point.heading }] },
    halo: { opacity: 0.18, transform: [{ scale: 1 }] },
  }) },
})('features/navigation/NavigationLoading.tsx');
const directory = path.resolve(__dirname, '../.expo/navigation-loading-preview');
fs.mkdirSync(directory, { recursive: true });
const screens = [['phone', 390, 760, false], ['small', 320, 568, false], ['map', 390, 300, true]].map(([name, width, height, compact]) =>
  h('section', { key: name, style: { width, margin: 12 } },
    h('p', null, name), h(native.View, { style: { width, height } },
      h(NavigationLoading, { compact, label: compact ? 'Préparation de la carte' : undefined, onExit: compact ? undefined : () => {} }))));
const markup = renderToStaticMarkup(h('main', { style: { display: 'flex', alignItems: 'flex-start' } }, screens));
const html = `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zwanga — chargement du trajet</title><style>${native.StyleSheet.getSheet().textContent}body{margin:0;background:#edf0f3;font-family:Arial,sans-serif}p{margin:12px;font-size:13px}</style>${markup}</html>`;
fs.writeFileSync(path.join(directory, 'index.html'), html);
console.log(path.join(directory, 'index.html'));
