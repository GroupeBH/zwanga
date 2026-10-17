/* global __dirname */
// The actual welcome screen, native/navigation mocked and no auth/network initialized.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement;
const logo = `data:image/png;base64,${fs.readFileSync(path.resolve(__dirname, '../assets/images/zwanga-transparent.png')).toString('base64')}`;
const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json');
const iconFont = fs.readFileSync(path.resolve(__dirname, '../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf')).toString('base64');
const samples = [
  { name: 'reference', width: 390, height: 844, label: '390 × 844 · maquette sans zones système', top: 0, bottom: 0 },
  { name: 'phone', width: 390, height: 844, label: '390 × 844 · zones sûres 47 / 34', top: 47, bottom: 34 },
  { name: 'small', width: 320, height: 568, label: '320 × 568 · zones sûres 24 / 24', top: 24, bottom: 24 },
  { name: 'large-text', width: 390, height: 844, label: '390 × 844 · texte 160 % (simulation Web)', top: 47, bottom: 34, fontScale: 1.6 },
  { name: 'landscape', width: 844, height: 390, label: '844 × 390 · paysage', top: 0, bottom: 20, left: 44, right: 44 },
  { name: 'tablet', width: 768, height: 1024, label: '768 × 1024 · tablette', top: 24, bottom: 20 },
];
const directory = path.resolve(__dirname, '../.expo/auth-welcome-preview');
fs.mkdirSync(directory, { recursive: true });
const previews = samples.map(sample => {
  const fontScale = sample.fontScale ?? 1;
  const { AuthWelcome } = loader({ 'react-native': { ...native,
    Text: ({ style, allowFontScaling, ...props }) => {
      const flat = native.StyleSheet.flatten(style) || {};
      return h(native.Text, { ...props, style: [style, allowFontScaling === false ? {} : {
        ...(flat.fontSize ? { fontSize: flat.fontSize * fontScale } : {}),
        ...(flat.lineHeight ? { lineHeight: flat.lineHeight * fontScale } : {}),
      }] });
    },
    useWindowDimensions: () => ({ ...sample, fontScale }) },
    'react-native-safe-area-context': {
      SafeAreaView: ({ edges: _edges, style, ...props }) => h(native.View, { ...props, style: [style, { paddingBottom: sample.bottom, paddingLeft: sample.left ?? 0, paddingRight: sample.right ?? 0 }] }),
      useSafeAreaInsets: () => ({ top: sample.top, bottom: sample.bottom, left: sample.left ?? 0, right: sample.right ?? 0 }),
    },
    '@react-navigation/native': { useIsFocused: () => true }, 'expo-router': { useRouter: () => ({ push() {} }) },
    '@/assets/images/zwanga-transparent.png': { uri: logo },
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { 'aria-hidden': true, style: { fontFamily: 'Ionicons', fontSize: size, color, flexShrink: 0 } }, String.fromCodePoint(glyphs[name])) },
    'react-native-svg': { __esModule: true, default: ({ style, ...props }) => h('svg', { ...props, style: native.StyleSheet.flatten(style) }), Path: props => h('path', props) },
  })('features/auth/AuthWelcome.tsx');
  const screen = h(native.View, { style: { width: sample.width, height: sample.height } }, h(AuthWelcome));
  const markup = renderToStaticMarkup(h('section', { 'data-case': sample.name }, screen));
  fs.writeFileSync(path.join(directory, `${sample.name}.html`), html(markup));
  return h('section', { key: sample.label, 'data-case': sample.label, style: { width: sample.width, margin: 12 } },
    h('p', null, sample.label), screen);
});
const markup = renderToStaticMarkup(h('main', { style: { display: 'flex', alignItems: 'flex-start', flexWrap: 'wrap' } }, previews));
async function measure() {
  await document.fonts.ready;
  const results = [...document.querySelectorAll('[data-case]')].map(section => {
    const screen = section.lastElementChild;
    const scroll = [...section.querySelectorAll('div')].find(node => getComputedStyle(node).overflowY === 'auto' || getComputedStyle(node).overflowY === 'scroll');
    const actions = [...section.querySelectorAll('[data-testid="auth-welcome-signup"], [data-testid="auth-welcome-login"], [role="link"]')];
    const visible = () => actions.every(button => button.getBoundingClientRect().top >= scroll.getBoundingClientRect().top && button.getBoundingClientRect().bottom <= scroll.getBoundingClientRect().bottom + 1);
    const initiallyVisible = visible();
    scroll.scrollTop = scroll.scrollHeight;
    const result = { case: section.dataset.case, horizontalOverflow: Math.max(screen.scrollWidth - screen.clientWidth, scroll.scrollWidth - scroll.clientWidth),
      actionsInitiallyVisible: initiallyVisible, actionsReachableAtEnd: visible(),
      minActionHeight: Math.min(...actions.map(node => node.getBoundingClientRect().height)) };
    if (!window.location.search.includes('bottom')) scroll.scrollTop = 0;
    return result;
  });
  document.getElementById('measurements').textContent = JSON.stringify(results, null, 2);
  document.body.dataset.measurements = JSON.stringify(results);
}
function html(content) {
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Zwanga — aperçu bienvenue</title><style>${native.StyleSheet.getSheet().textContent}
@font-face{font-family:Ionicons;src:url(data:font/ttf;base64,${iconFont})}body{margin:0;background:#eef0f4;font-family:Arial,sans-serif}p{margin:12px;font-size:13px}</style>${content}<pre id="measurements"></pre><script>(${measure.toString()})();</script></html>`;
}
fs.writeFileSync(path.join(directory, 'index.html'), html(markup));
console.log(path.join(directory, 'index.html'));
