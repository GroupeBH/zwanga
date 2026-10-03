/* global __dirname */
// Preview of the actual sheet with synthetic invitations. Native SVG/sharing still need device tests.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const qr = require('qrcode');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement;
const glyphs = { close: '×', 'share-social-outline': '↗', 'qr-code-outline': '▦' };
async function main() {
  const states = [
    { label: 'Invitation prête', width: 360, height: 760, phase: 'ready' },
    { label: 'Petit écran', width: 320, height: 568, phase: 'ready' },
    { label: 'Connexion indisponible', width: 360, height: 760, phase: 'error' },
  ];
  const value = 'https://invite.example.test/demo-zwanga';
  const previews = [];
  for (const sample of states) {
    const size = Math.max(128, Math.min(sample.width - 80, 280, sample.height - 340)), modules = qr.create(value).modules.size;
    const image = await qr.toString(value, { type: 'svg', errorCorrectionLevel: 'M', width: size,
      margin: Math.ceil(modules * 56 / size) });
    const { ReferralQrModal } = loader({ 'react-native': { ...native,
      Platform: { ...native.Platform, OS: 'android' }, useWindowDimensions: () => ({ width: sample.width, height: sample.height }) },
      'react-native-safe-area-context': { SafeAreaView: native.View, useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
      'react-native-qrcode-svg': () => h('div', { 'data-qr': true, dangerouslySetInnerHTML: { __html: image } }),
      '@/features/navigation/RideModal': { RideModal: ({ children }) => children },
      '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { style: { fontSize: size, color } }, glyphs[name] ?? '•') },
    })('features/referrals/ReferralQrModal.tsx');
    previews.push(h('section', { key: sample.label, 'data-case': sample.label, style: { width: sample.width, margin: 8 } },
      h('p', null, sample.label), h(native.View, { style: { height: sample.height } }, h(ReferralQrModal,
        { state: { phase: sample.phase, link: value, code: 'DEMO2026' }, onClose() {}, onRetry() {} }))));
  }
  const markup = renderToStaticMarkup(h('main', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' } }, previews));
  function measure() {
    document.getElementById('measurements').textContent = JSON.stringify([...document.querySelectorAll('[data-case]')].map(section => {
      const screen = section.lastElementChild;
      const buttons = [...section.querySelectorAll('[role="button"]')];
      const code = section.querySelector('[data-qr]');
      const firstAction = buttons.find(button => button.textContent.includes('Partager le QR'));
      return { case: section.dataset.case, horizontalOverflow: screen.scrollWidth - screen.clientWidth,
        qrNotCovered: !code || code.getBoundingClientRect().bottom <= firstAction.getBoundingClientRect().top,
        buttonsVisible: buttons.every(button => button.getBoundingClientRect().bottom <= screen.getBoundingClientRect().bottom) };
    }), null, 2);
  }
  const directory = path.resolve(__dirname, '../.expo/referral-qr-preview');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${native.StyleSheet.getSheet().textContent}
body{margin:0;background:#eef0f4;font-family:Arial,sans-serif}p{margin:12px;font-size:13px}</style>${markup}<pre id="measurements"></pre><script>(${measure.toString()})();</script></html>`);
  console.log(path.join(directory, 'index.html'));
}
void main();
