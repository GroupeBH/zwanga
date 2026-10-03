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
const samples = [{ width: 360, height: 760, label: '360 × 760' }, { width: 320, height: 568, label: '320 × 568' }];
const previews = samples.map(sample => {
  const { AuthWelcome } = loader({ 'react-native': { ...native, useWindowDimensions: () => ({ ...sample, fontScale: 1 }) },
    'react-native-safe-area-context': { SafeAreaView: native.View },
    '@react-navigation/native': { useIsFocused: () => true }, 'expo-router': { useRouter: () => ({ push() {} }) },
    '@/assets/images/zwanga-transparent.png': { uri: logo },
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { style: { fontSize: size, color } }, name === 'arrow-forward' ? '→' : '•') },
  })('features/auth/AuthWelcome.tsx');
  return h('section', { key: sample.label, 'data-case': sample.label, style: { width: sample.width, margin: 12 } },
    h('p', null, sample.label), h(native.View, { style: { height: sample.height, paddingTop: 24, paddingBottom: 24, backgroundColor: 'white' } }, h(AuthWelcome)));
});
const markup = renderToStaticMarkup(h('main', { style: { display: 'flex', alignItems: 'flex-start' } }, previews));
function measure() {
  document.getElementById('measurements').textContent = JSON.stringify([...document.querySelectorAll('[data-case]')].map(section => {
    const screen = section.lastElementChild;
    const actions = [...section.querySelectorAll('[role="button"], [role="link"]')];
    const disclosure = [...section.querySelectorAll('div')].find(node => node.textContent.startsWith('Pendant un trajet actif') && node.children.length === 0);
    const firstButton = section.querySelector('[role="button"]');
    return { case: section.dataset.case, horizontalOverflow: screen.scrollWidth - screen.clientWidth,
      actionsVisible: actions.every(button => button.getBoundingClientRect().bottom <= screen.getBoundingClientRect().bottom),
      disclosureAboveActions: disclosure.getBoundingClientRect().bottom <= firstButton.getBoundingClientRect().top };
  }), null, 2);
}
const directory = path.resolve(__dirname, '../.expo/auth-welcome-preview');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${native.StyleSheet.getSheet().textContent}
body{margin:0;background:#eef0f4;font-family:Arial,sans-serif}p{margin:12px;font-size:13px}</style>${markup}<pre id="measurements"></pre><script>(${measure.toString()})();</script></html>`);
console.log(path.join(directory, 'index.html'));
