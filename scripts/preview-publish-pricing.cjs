/* global __dirname */
// Local web rendering of the real components; not a native-device validation.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement;
const noop = () => {};
const cases = [
  { width: 320, height: 568, name: '320 · réserve à recharger', funds: 0 },
  { width: 360, height: 800, name: '360 · cash disponible', funds: 20 },
  { width: 411, height: 884, name: '411 · réserve à recharger', funds: 0 },
];
const previews = cases.map(sample => {
  const load = loader({
    'react-native': native,
    '@/utils/reanimated': { __esModule: true, default: { View: native.View } },
    '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { style: { fontSize: size, color } },
      ({ add: '+', remove: '−', checkmark: '✓', cash: '▣', 'checkmark-done': '✓' })[name] ?? '•') },
    'expo-router': { useRouter: () => ({ push: noop }) },
    '@/store/hooks': { useAppSelector: () => ({ id: 'synthetic-driver' }) }, '@/store/selectors': {},
    '@/store/api/driverFinanceApi': { useDriverFinanceSummaryQuery: () => ({ currentData: {
      cash: { enabled: true, moneyPerToken: 100, availableTokens: sample.funds },
    }, isFetching: false, isError: false, refetch: noop }) },
  });
  const Pricing = load('features/publish/PublishPricingStep.tsx').PublishPricingStep;
  const Indicator = load('features/publish/PublishStepIndicator.tsx').PublishStepIndicator;
  const { styles } = load('features/screen-styles/app/publish/index.ts');
  return h('section', { key: sample.width, 'data-case': sample.name, style: { width: sample.width, margin: 12 } },
    h('p', null, sample.name),
    h(native.View, { style: { height: sample.height, backgroundColor: '#EEF2F6' } },
      h(native.View, { style: { height: 26 } }),
      h(native.View, { style: styles.header },
        h(native.Text, { style: styles.closeButton }, '×'),
        h(native.View, { style: styles.headerContent }, h(native.Text, { style: styles.headerTitle }, 'Publier un trajet'),
          h(native.Text, { style: styles.headerSubtitle }, 'Étape 4/5'))),
      h(Indicator, { isStepActive: step => step === 'pricing', isStepCompleted: step => ['route', 'datetime', 'vehicle'].includes(step) }),
      h('div', { 'data-scroll': true, style: { overflow: 'auto', flex: 1 } },
        h(native.View, { style: [styles.scrollViewContent, { paddingBottom: 24 }] }, h(Pricing, {
          seats: '4', vehicleType: 'car', price: '2000', isFreeTrip: false, acceptedPaymentModes: ['electronic', 'points'],
          requiresPassengerKyc: false, description: '', setSeats: noop, setPrice: noop, setIsFreeTrip: noop,
          setAcceptedPaymentModes: noop, setRequiresPassengerKyc: noop, setDescription: noop,
        }))),
      h(native.View, { style: [styles.fixedBottomBar, styles.fixedBottomBarRow, { paddingBottom: 16 }] },
        h(native.View, { style: [styles.button, styles.buttonSecondary, styles.fixedFooterBackButton] },
          h(native.Text, { style: styles.buttonSecondaryText }, 'Retour')),
        h(native.View, { style: [styles.button, styles.fixedButton, styles.fixedFooterPrimaryButton] },
          h(native.Text, { style: styles.buttonText }, 'Continuer')))));
});
const markup = renderToStaticMarkup(h('main', { style: { display: 'flex', alignItems: 'flex-start' } }, previews));
function measure() {
  document.getElementById('measurements').textContent = JSON.stringify([...document.querySelectorAll('[data-case]')].map(section => {
    const scroll = section.querySelector('[data-scroll]');
    return { case: section.dataset.case, horizontalOverflow: scroll.scrollWidth - scroll.clientWidth,
      scrollRemaining: scroll.scrollHeight - scroll.clientHeight };
  }));
}
const directory = path.resolve(__dirname, '../.expo/publish-pricing-preview');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${native.StyleSheet.getSheet().textContent}
body{margin:0;background:#dbe1e8;font-family:Arial,sans-serif}p{margin:8px 0;font-size:13px}</style>${markup}<pre id="measurements"></pre><script>(${measure.toString()})();</script></html>`);
console.log(path.join(directory, 'index.html'));
