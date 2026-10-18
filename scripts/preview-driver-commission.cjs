/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement;
const cases = [
  { width: 320, name: 'Réserve vide · 320', available: 0, reserved: 0, debt: 0 },
  { width: 360, name: 'Réserve disponible · 360', available: 25, reserved: 3, debt: 0 },
  { width: 411, name: 'Régularisation · 411', available: 0, reserved: 2, debt: 4 },
];
const previews = cases.map(sample => {
  const { DriverCommissionPanel } = loader({ 'react-native': native,
    'expo-router': { useRouter: () => ({ push() {} }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/api/driverFinanceApi': { useDriverFinanceSummaryQuery: () => ({
      currentData: { commissionRate: 0.05, proPrice: 5000, currency: 'CDF', durationDays: 30,
        pro: { isActive: false, endDate: null }, trial: null,
        cash: { enabled: sample.available > 0, availableTokens: sample.available, reservedTokens: sample.reserved,
          debtTokens: sample.debt, coverageAmount: sample.available * 2000 } },
      isFetching: false, error: null, refetch() {},
    }) },
  })('features/driver-payments/DriverCommissionPanel.tsx');
  return h('section', { key: sample.name, 'data-case': sample.name, style: { width: sample.width, margin: 12 } },
    h('p', null, sample.name),
    h(native.View, { style: { padding: 16, backgroundColor: '#F8F9FA' }, testID: 'frame' },
      h(DriverCommissionPanel, { userId: 'synthetic-driver', onRecharge() {} })));
});
const markup = renderToStaticMarkup(h('main', { style: { display: 'flex', alignItems: 'flex-start' } }, previews));
function measure() {
  document.getElementById('measurements').textContent = JSON.stringify([...document.querySelectorAll('[data-case]')].map(section => {
    const frame = section.lastElementChild;
    return { case: section.dataset.case, horizontalOverflow: frame.scrollWidth - frame.clientWidth, height: frame.clientHeight };
  }));
}
const directory = path.resolve(__dirname, '../.expo/driver-commission-preview');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${native.StyleSheet.getSheet().textContent}
body{margin:0;background:#dbe1e8;font-family:Arial,sans-serif}p{font-size:13px}</style>${markup}<pre id="measurements"></pre><script>(${measure.toString()})();</script></html>`);
console.log(path.join(directory, 'index.html'));
