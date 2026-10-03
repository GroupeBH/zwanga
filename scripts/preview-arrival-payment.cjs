/* global __dirname */
// Actual React components, synthetic bookings, browser-only layout preview.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement, noop = () => {};
const load = loader({ 'react-native': native,
  'expo-linking': { createURL: () => 'zwanga://payment' },
  '@/constants/paymentFeatures': { ELECTRONIC_PAYMENTS_ENABLED: true },
  '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { style: { fontSize: size, color } },
    name === 'checkmark-circle' || name === 'checkmark' ? '✓' : name === 'ellipse-outline' ? '○' : name.includes('wallet') ? '▤' : '◇') },
});
const { ArrivalPaymentFields } = load('features/arrival-payment/ArrivalPaymentFields.tsx');
const { ArrivalPaymentActions } = load('features/arrival-payment/ArrivalPaymentActions.tsx');
const { styles } = load('features/screen-styles/components/PassengerArrivalPaymentCoordinator/index.ts');
const booking = { id: 'preview', numberOfSeats: 3, paymentMode: 'electronic', paymentAmount: 3000, status: 'completed',
  passengerDestination: 'Destination de démonstration' };
const defaults = { arrivalBooking: booking, destination: booking.passengerDestination, paymentAmount: 3000, paymentCurrency: 'CDF',
  selectedMode: 'electronic', selectedChannel: 'mpesa', paymentAlreadySucceeded: false, paymentPhone: '+243000000000',
  setSelectedMode: noop, setSelectedChannel: noop, setPaymentPhone: noop, setPaymentError: noop, setStatusMessage: noop,
  walletBalance: 20, pointsUsed: 20, amountCoveredByPoints: 2000, moneyComplement: 1000, needsMobileMoneyPhone: true };
const receipt = { bookingId: 'preview', mode: 'points', amount: 3000, currency: 'CDF', numberOfSeats: 3,
  walletBalance: 10, earnedPoints: 2, earnedPointsKnown: true, paymentReference: 'ZW-DEMONSTRATION-2026', invoiceUrl: '/payment-history',
  driverNotice: 'Le paiement est confirmé. Le conducteur peut consulter son état dans le trajet.' };
const cases = [
  { name: 'Mobile Money', width: 360, height: 780, fields: {}, actions: { actionLabel: 'Payer par M-Pesa' } },
  { name: 'Jetons + complément', width: 360, height: 780, fields: { selectedMode: 'points' }, actions: { actionLabel: 'Ajouter 1.000 FC et payer' } },
  { name: 'Espèces', width: 320, height: 640, fields: { selectedMode: 'cash', needsMobileMoneyPhone: false }, actions: { actionLabel: 'Terminer · paiement en espèces' } },
  { name: 'Paiement confirmé', width: 360, height: 780, fields: { completionSummary: receipt }, actions: { completionSummary: receipt } },
  { name: 'Clavier simulé', width: 320, height: 640, keyboard: 260, fields: {}, actions: { actionLabel: 'Payer par M-Pesa' } },
  { name: 'Texte agrandi · attente', width: 320, height: 720, scale: 1.5, fields: { hasPendingProviderPayment: true },
    actions: { hasPendingProviderPayment: true, verification: { phase: 'paused', message: 'Vérification indisponible. Votre paiement reste en attente.' } } },
];
function phone(item) {
  const props = { ...defaults, ...item.fields };
  return h('section', { 'data-case': item.name, 'data-scale': item.scale ?? 1, style: { width: item.width, margin: 12, flexShrink: 0 } },
    h('p', null, item.name),
    h(native.View, { testID: 'phone', style: { width: item.width, height: item.height, backgroundColor: '#DDE1E6', overflow: 'hidden' } },
      h(native.View, { style: { flex: 1, justifyContent: 'flex-end', minHeight: 0 } },
        h(native.View, { testID: 'sheet', style: [styles.sheet, { maxHeight: '94%', paddingBottom: 16 }] },
          h(native.View, { style: styles.handle }),
          h(ArrivalPaymentFields, props),
          h(native.View, { testID: 'footer', style: { flexShrink: 0 } }, h(ArrivalPaymentActions, { ...props,
            verification: { phase: 'idle', message: '' }, onPay: noop, onRetry: noop, onClose: noop, onDone: noop, onInvoice: noop, ...item.actions })))),
      item.keyboard ? h(native.View, { style: { height: item.keyboard, justifyContent: 'center', alignItems: 'center', backgroundColor: '#CBD0D8' } },
        h(native.Text, null, 'Clavier simulé')) : null));
}
function measure() {
  document.querySelectorAll('[data-scale]').forEach(section => {
    const scale = Number(section.getAttribute('data-scale'));
    if (scale === 1) return;
    [...section.querySelectorAll('[dir="auto"], input')].forEach(el => {
      const css = getComputedStyle(el), size = parseFloat(css.fontSize), line = parseFloat(css.lineHeight);
      el.style.fontSize = `${size * scale}px`;
      if (Number.isFinite(line)) el.style.lineHeight = `${line * scale}px`;
    });
  });
  const results = [...document.querySelectorAll('[data-case]')].map(section => {
    const sheet = section.querySelector('[data-testid="sheet"]'), footer = section.querySelector('[data-testid="footer"]');
    return { name: section.dataset.case, horizontalOverflow: sheet.scrollWidth - sheet.clientWidth,
      footerInsideSheet: footer.getBoundingClientRect().bottom <= sheet.getBoundingClientRect().bottom + 1,
      primaryVisible: footer.getBoundingClientRect().top >= sheet.getBoundingClientRect().top };
  });
  document.getElementById('measurements').textContent = JSON.stringify(results, null, 2);
}
const markup = renderToStaticMarkup(h('main', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' } }, ...cases.map(phone)));
const directory = path.resolve(__dirname, '../.expo/arrival-payment-preview');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${native.StyleSheet.getSheet().textContent}
body{margin:0;background:#edf0f3;font-family:Arial,sans-serif}p{font-size:13px}</style>${markup}<pre id="measurements"></pre><script>(${measure.toString()})();</script></html>`);
console.log(path.join(directory, 'index.html'));
