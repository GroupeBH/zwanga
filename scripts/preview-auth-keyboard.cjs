/* global __dirname */
// Render the actual components with synthetic data and a simulated keyboard.
// Browser geometry is not a substitute for Android/iOS keyboard validation.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement, noop = () => {};
const load = loader({ 'react-native': native,
  '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { style: { fontSize: size, color } }, name === 'arrow-back' ? '←' : '◈') },
  'expo-clipboard': { getStringAsync: async () => '' },
  '@/utils/reanimated': { __esModule: true, default: { View: ({ entering, exiting, ...props }) => h(native.View, props) }, FadeInDown: { springify: noop }, FadeOutUp: {} },
});
const { AuthHeader } = load('components/auth/AuthHeader.tsx');
const { ResetPinStep } = load('components/auth/steps/ResetPinStep.tsx');
const { PinStep } = load('components/auth/steps/PinStep.tsx');
const { authStyles } = load('components/auth/styles.ts');
const { authCodeStyles } = load('features/auth/authCode.styles.ts');
const ref = { current: null }, noopRef = { current: [] };
const resetProps = { phone: '+243000000000', otpCode: ['1', '2', '', '', '', ''], otpInputRefs: noopRef,
  newPin: '12', newPinConfirm: '', pinInputRef: ref, pinConfirmInputRef: ref,
  onOtpChange: noop, onPinChange: noop, onPinConfirmChange: noop, onVerifyOtp: noop, onResetPin: noop,
  onResendOtp: noop, isLoading: false, isResending: false, keyboardVisible: true };
const variants = [
  { width: 320, height: 568, keyboard: 240, scale: 1 },
  { width: 360, height: 640, keyboard: 320, scale: 1 },
  { width: 390, height: 844, keyboard: 346, scale: 1 },
  { width: 320, height: 568, keyboard: 240, scale: 1.5 },
];
function phone(variant, stage) {
  const { width, height, keyboard, scale } = variant;
  const step = stage === 'login' ? h(PinStep, { ...resetProps, mode: 'login', pin: '12', pinConfirm: '', onForgotPin: noop, onSubmit: noop })
    : h(ResetPinStep, { ...resetProps, resetPinStep: stage });
  return h('section', { 'data-case': `${stage}-${width}-${scale}`, 'data-scale': scale,
    style: { width, flexShrink: 0, margin: 12 } },
  h('p', null, `${stage} · ${width}×${height} · texte ${scale}×`),
  h(native.View, { style: { width, height, backgroundColor: '#F8F9FA', border: '1px solid #ccd0d4', overflow: 'hidden' } },
    h(native.View, { style: { height: height - keyboard, minHeight: 0 } },
      h(native.View, { style: { height: 24 } }),
      h(AuthHeader, { mode: 'login', canGoBack: true, compact: true, onBack: noop, onModeChange: noop, progress: 0 }),
      h(native.ScrollView, { testID: 'viewport', style: authCodeStyles.viewport,
        contentContainerStyle: [authStyles.scrollViewContent, authCodeStyles.content] }, step)),
    h(native.View, { style: { height: keyboard, backgroundColor: '#E1E5EB', alignItems: 'center', justifyContent: 'center' } },
      h(native.Text, { style: { fontSize: 15, color: '#586174' } }, 'Clavier simulé'))));
}
const markup = renderToStaticMarkup(h('main', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start' } },
  ...variants.flatMap(variant => ['otp', 'login', 'newPin'].map(stage => phone(variant, stage)))));
function measure() {
  document.querySelectorAll('[data-scale]').forEach(section => {
    const scale = Number(section.getAttribute('data-scale'));
    if (scale === 1) return;
    const texts = [...section.querySelectorAll('[dir="auto"], input')].map(el => {
      const css = window.getComputedStyle(el);
      return { el, fontSize: parseFloat(css.fontSize), lineHeight: parseFloat(css.lineHeight) };
    });
    texts.forEach(({ el, fontSize, lineHeight }) => {
      el.style.fontSize = `${fontSize * scale}px`;
      if (Number.isFinite(lineHeight)) el.style.lineHeight = `${lineHeight * scale}px`;
    });
  });
  const results = [...document.querySelectorAll('[data-case]')].map(section => {
    const viewport = section.querySelector('[data-testid="viewport"]');
    const inputs = [...viewport.querySelectorAll('input')].filter(el => el.getBoundingClientRect().width > 1);
    return { name: section.getAttribute('data-case'), viewport: viewport.clientHeight,
      content: viewport.scrollHeight, overflow: viewport.scrollHeight - viewport.clientHeight,
      horizontalOverflow: viewport.scrollWidth - viewport.clientWidth,
      inputMinWidth: inputs.length ? Math.min(...inputs.map(el => el.getBoundingClientRect().width)) : null };
  });
  document.getElementById('measurements').textContent = JSON.stringify(results, null, 2);
}
const directory = path.resolve(__dirname, '../.expo/auth-keyboard-preview');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${native.StyleSheet.getSheet().textContent}
body{margin:0;background:#edf0f3;font-family:Arial,sans-serif}p{font-size:13px}</style>${markup}<pre id="measurements"></pre><script>(${measure.toString()})();</script></html>`);
console.log(path.join(directory, 'index.html'));
