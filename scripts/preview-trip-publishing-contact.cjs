/* global __dirname */
// Real components rendered with RN Web, synthetic contacts and mocked native navigation.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement;
const load = loader({
  'react-native': native,
  '@/utils/reanimated': { __esModule: true, default: { View: native.View } },
  '@/components/forms/FormLayout': { FormModal: ({ children }) => children },
  'react-native-safe-area-context': { SafeAreaView: native.View },
  '@/hooks/navigation/useTripContactMessaging': { useTripContactMessaging: () => ({ canMessage: true, userId: 'viewer', cancel() {}, openMessage() {} }) },
  '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { style: { fontSize: size, color } },
    ({ add: '+', remove: '−', close: '×', 'chevron-forward': '›', 'chatbubble-ellipses-outline': '✉', 'call-outline': '☎', 'logo-whatsapp': 'W' })[name] ?? '•') },
});
const { PublishPricingStep } = load('features/publish/PublishPricingStep.tsx');
const { NavigationContactModal } = load('features/navigation/NavigationContactModal.tsx');
const noop = () => {};
const cases = [
  { label: 'Places · moto', width: 360, vehicleType: 'motorcycle_2_wheels', seats: '2' },
  { label: 'Places · voiture', width: 320, vehicleType: 'car', seats: '1' },
  { label: 'Contact · navigation', width: 360, contact: true, phone: '000000000' },
  { label: 'Contact · sans numéro', width: 320, contact: true, phone: null },
];
const markup = renderToStaticMarkup(h('main', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' } }, cases.map(sample =>
  h('section', { key: sample.label, 'data-case': sample.label, style: { width: sample.width, margin: 8 } },
    h('p', null, sample.label),
    h(native.View, { style: { height: 760, backgroundColor: '#f7f8fa' } }, sample.contact
      ? h(NavigationContactModal, { role: 'passenger', onClose: noop, allowPhoneCall: Boolean(sample.phone),
        contacts: [{ id: 'test-contact', name: 'Conducteur de démonstration', phone: sample.phone, detail: 'Votre conducteur' }] })
      : h(native.ScrollView, null, h(PublishPricingStep, { ...sample, setSeats: noop, price: '2500', setPrice: noop,
        isFreeTrip: false, setIsFreeTrip: noop, requiresPassengerKyc: false, setRequiresPassengerKyc: noop,
        description: '', setDescription: noop, insets: { bottom: 0 }, goToStep: noop, handleNextStep: noop })))))));
function measure() {
  document.getElementById('measurements').textContent = JSON.stringify([...document.querySelectorAll('[data-case]')].map(section => ({
    case: section.dataset.case, horizontalOverflow: section.scrollWidth - section.clientWidth,
    buttons: [...section.querySelectorAll('[aria-label]')].filter(node => /une place|message dans Zwanga/.test(node.getAttribute('aria-label')))
      .map(node => ({ label: node.getAttribute('aria-label'), width: Math.round(node.getBoundingClientRect().width), height: Math.round(node.getBoundingClientRect().height) })),
  })), null, 2);
}
const directory = path.resolve(__dirname, '../.expo/trip-publishing-contact-preview');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${native.StyleSheet.getSheet().textContent}
body{margin:0;background:#eef0f4;font-family:Arial,sans-serif}p{margin:12px;font-size:13px}</style>${markup}<pre id="measurements"></pre><script>(${measure.toString()})();</script></html>`);
console.log(path.join(directory, 'index.html'));
