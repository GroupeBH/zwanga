const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

for (const [role, priority] of [['driver', 30], ['passenger', 70]]) {
  test(`${role}: only the actually visible payment publishes speech; preemption, background and native blocker silence it`, () => {
    const providerHooks = hookHarness(), hostHooks = hookHarness(), speechHooks = hookHarness();
    let foreground = true;
    const react = { ...providerHooks.react, createContext: value => ({ value, Provider: 'Provider' }),
      useContext: context => context.value, useSyncExternalStore: (_, read) => read() };
    const load = loader({ react,
      'react-native': { Platform: { OS: 'ios' }, View: 'View', StyleSheet: { create: x => x }, Keyboard: { dismiss() {} } },
      './RideNoticeBanner': { RideNoticeBanner: 'Notice' },
      '@/hooks/useAppIsActive': { useAppIsActive: () => foreground },
      '@/store/hooks': { useAppSelector: () => ({ id: role }) }, '@/store/selectors': {},
      '@/services/tokenSession': { getTokenSessionVersion: () => 0 },
    });
    const { RideOverlayProvider } = load('features/navigation/RideOverlayProvider.tsx');
    const contexts = load('features/navigation/rideOverlayContext.ts');
    const provider = providerHooks.render(() => RideOverlayProvider({ children: null }));
    const store = provider.props.value; contexts.RideOverlayContext.value = store;
    const host = provider.props.children.at(-1);
    const { PaymentModalAnnouncement } = load('components/PaymentModalAnnouncement.tsx');
    const source = load('services/paymentSpeechSource.ts');
    const message = { key: 'payment-test', text: 'Paiement confirmé.' };
    store.put({ id: 'payment', scope: 'global', priority, children: 'payment content' });
    const render = () => {
      Object.assign(react, hostHooks.react);
      const tree = hostHooks.render(() => host.type(host.props));
      const payment = tree.props.children.find(node => node.key === 'payment');
      const visibility = payment.props.children;
      assert.equal(visibility.type, contexts.RideOverlayVisibilityContext.Provider);
      contexts.RideOverlayVisibilityContext.value = visibility.props.value;
      Object.assign(react, speechHooks.react);
      speechHooks.render(() => PaymentModalAnnouncement({ message, enabled: true }));
      return source.readPaymentSpeech(role, 0);
    };
    assert.equal(render().message.text, message.text);
    for (let i = 0; i < 10; i++) {
      store.put({ id: 'confirm', scope: 'global', priority: 80, children: 'confirmation' });
      assert.equal(render(), undefined);
      store.remove('confirm'); assert.equal(render().message.text, message.text);
    }
    store.blockNative('native-dialog', true); assert.equal(render(), undefined);
    store.blockNative('native-dialog', false); assert.ok(render());
    foreground = false; assert.equal(render(), undefined);
    foreground = true; assert.ok(render());
    speechHooks.unmount(); hostHooks.unmount(); providerHooks.unmount();
    assert.equal(source.readPaymentSpeech(role, 0), undefined);
  });
}
