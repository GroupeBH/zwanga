/* global __dirname */
// React Native Web preview of the real result component. Only synthetic bookings.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement;
const glyphs = { checkmark: '✓', close: '×', alert: '!', 'time-outline': '◷', 'cloud-upload-outline': '↑', 'arrow-forward': '→', 'car-outline': '↗', 'flag-outline': '⚑' };
const { RideActionResultModal } = loader({ 'react-native': native,
  'react-native-safe-area-context': { SafeAreaView: native.View },
  '@/features/navigation/RideModal': { RideModal: ({ children }) => children },
  '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { style: { fontSize: size, color, lineHeight: 1 } }, glyphs[name] ?? '•') },
})('features/ride-recovery/RideActionResultModal.tsx');
const cases = [
  { label: 'Embarquement · validé', stage: 'pickup', state: 'confirmed' },
  { label: 'Dépose · validée', stage: 'dropoff', state: 'confirmed' },
  { label: 'En attente du conducteur', stage: 'pickup', state: 'received' },
  { label: 'Sauvegardé hors ligne', stage: 'dropoff', state: 'queued' },
  { label: 'Échec serveur', stage: 'dropoff', state: 'blocked' },
  { label: 'Petit écran · texte agrandi', stage: 'pickup', error: 'Impossible d’enregistrer votre confirmation sur ce téléphone. Revenez au trajet pour réessayer.', width: 320, height: 568, scale: 1.4 },
];
const markup = renderToStaticMarkup(h('main', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' } }, cases.map((item, i) =>
  h('section', { key: i, 'data-case': item.label, 'data-scale': item.scale ?? 1, style: { width: item.width ?? 360, margin: 12 } },
    h('p', null, item.label), h(native.View, { style: { height: item.height ?? 720 } }, h(RideActionResultModal, {
      result: { id: 'preview', userId: 'preview', tripId: 'preview', bookingId: 'preview', stage: item.stage, actor: 'passenger', numberOfSeats: 3,
        error: item.error, receipt: item.state ? { eventId: 'preview', state: item.state, decision: 'confirm' } : undefined }, onClose() {},
    }))))));
function measure() {
  const results = [];
  document.querySelectorAll('[data-case]').forEach(section => {
    const scale = Number(section.dataset.scale);
    if (scale > 1) section.querySelectorAll('[dir="auto"]').forEach(el => {
      const css = getComputedStyle(el), size = parseFloat(css.fontSize), line = parseFloat(css.lineHeight);
      el.style.fontSize = `${size * scale}px`; if (Number.isFinite(line)) el.style.lineHeight = `${line * scale}px`;
    });
    const button = [...section.querySelectorAll('[role="button"]')].at(-1), screen = section.lastElementChild;
    results.push({ case: section.dataset.case, horizontalOverflow: screen.scrollWidth - screen.clientWidth,
      actionVisible: button.getBoundingClientRect().bottom <= screen.getBoundingClientRect().bottom && button.getBoundingClientRect().top >= screen.getBoundingClientRect().top });
  });
  document.getElementById('measurements').textContent = JSON.stringify(results, null, 2);
}
const directory = path.resolve(__dirname, '../.expo/ride-result-preview');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${native.StyleSheet.getSheet().textContent}
body{margin:0;background:#edf0f3;font-family:Arial,sans-serif}p{font-size:13px}</style>${markup}<pre id="measurements"></pre><script>(${measure.toString()})();</script></html>`);
console.log(path.join(directory, 'index.html'));
