const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const model = loader()('features/arrival-payment/paymentAnnouncement.ts');
const base = { bookingId: 'test', amount: 800, currency: 'CDF', pending: false, failed: false, beforeArrival: false };

test('payment voice reads the authoritative reduced amount, not the initial trip price', () => {
  assert.match(model.passengerPaymentAnnouncement(base).text, /800 francs congolais/);
  assert.equal(model.passengerPaymentAnnouncement({ ...base, amount: null }), null);
  assert.equal(model.passengerPaymentAnnouncement({ ...base, amount: NaN }), null);
  assert.match(model.passengerPaymentAnnouncement({ ...base, pending: true }).text, /reste à vérifier/);
  assert.doesNotMatch(model.passengerPaymentAnnouncement({ ...base, pending: true, failed: true }).text, /confirmé/);
  assert.match(model.passengerPaymentAnnouncement({ ...base, failed: true }).text, /n’est pas confirmé/);
});
test('mixed tokens/cash only announces the remainder as cash due, never as received', () => {
  const receipt = { bookingId: 'test', amount: 4500, cashInstructions: true, currency: 'CDF', mixedTokenAmount: 580, cashRemainder: 3920 };
  const voice = model.passengerPaymentAnnouncement({ ...base, receipt });
  assert.match(voice.text, /part en jetons est réglée/);
  assert.match(voice.text, /3\s920 francs congolais en espèces/);
  assert.doesNotMatch(voice.text, /Paiement.*confirmé/);
  assert.match(model.passengerPaymentAnnouncement({ ...base, receipt: { ...receipt, cashInstructions: false } }).text, /Paiement de 4\s500.*confirmé/);
  assert.match(model.passengerPaymentAnnouncement({ ...base, receipt: { ...receipt, amount: 0, cashInstructions: false } }).text, /gratuit/);
});
test('driver voice distinguishes electronic receipt from cash still to collect', () => {
  const notice = { ...base, mode: 'points' };
  assert.match(model.driverPaymentAnnouncement(notice).text, /confirmé en jetons/);
  assert.match(model.driverPaymentAnnouncement({ ...notice, mode: 'cash' }).text, /seulement après avoir reçu/);
  assert.match(model.driverPaymentAnnouncement({ ...notice, mode: 'cash' }, true).text, /Réception.*confirmée/);
});
test('visible foreground hook owns one source, cancels on hidden/background/account change and unmount', () => {
  const hooks = hookHarness(); let active = true, user = { id: 'passenger' }, version = 0;
  const load = loader({ react: hooks.react, '@/hooks/useAppIsActive': { useAppIsActive: () => active },
    '@/store/hooks': { useAppSelector: () => user }, '@/store/selectors': {},
    '@/services/tokenSession': { getTokenSessionVersion: () => version } });
  const { usePaymentAnnouncement } = load('hooks/notifications/usePaymentAnnouncement.ts');
  const source = load('services/paymentSpeechSource.ts');
  const render = (visible = true) => hooks.render(() => usePaymentAnnouncement(model.passengerPaymentAnnouncement(base), visible));
  render(); const first = source.readPaymentSpeech('passenger', 0); render();
  assert.equal(source.readPaymentSpeech('passenger', 0), first);
  active = false; render(); assert.equal(source.readPaymentSpeech('passenger', 0), undefined);
  active = true; render(); user = { id: 'driver' }; version++; render();
  assert.equal(source.readPaymentSpeech('passenger', 0), undefined);
  assert.ok(source.readPaymentSpeech('driver', 1));
  render(false); assert.equal(source.readPaymentSpeech('driver', 1), undefined);
  render(); hooks.unmount(); assert.equal(source.readPaymentSpeech('driver', 1), undefined);
});

test('driver notice speaks only the displayed confirmed payment for the current account', async () => {
  const React = require('react'), hooks = hookHarness();
  let user = { id: 'driver', role: 'driver' }, active = true, spoken;
  const notice = { key: 'payment-test', bookingId: 'booking', tripId: 'trip', amount: 800, currency: 'CDF', mode: 'points' };
  const trips = [{ id: 'trip', driverId: 'driver', status: 'ongoing', departureTime: '2030-01-01T12:00:00Z', paymentNotices: [notice] }];
  const Component = loader({ react: { ...React, ...hooks.react },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'Scroll', TouchableOpacity: 'Button', StyleSheet: { create: x => x, hairlineWidth: 1 } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-router': { useRouter: () => ({ push() {} }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@react-native-async-storage/async-storage': { getItem: async () => null, setItem: async () => {} },
    '@/features/navigation/RideModal': { RideModal: 'Modal' }, '@/hooks/useAppIsActive': { useAppIsActive: () => active },
    '@/store/selectors': { selectUser: () => user, selectIsAuthenticated: () => true },
    '@/store/hooks': { useAppSelector: fn => fn() }, '@/store/api/tripApi': { useGetMyActivityTripsQuery: () => ({ data: trips }) },
    '@/hooks/notifications/usePaymentAnnouncement': { usePaymentAnnouncement: (message, visible) => { spoken = { message, visible }; } },
    '@/hooks/notifications/useDriverPaymentInbox': { useDriverPaymentInbox: () => ({ notices: [], legacy: true }) },
  })('components/DriverPaymentNoticeCoordinator.tsx').DriverPaymentNoticeCoordinator;
  const render = () => hooks.render(Component);
  render(); await new Promise(resolve => setImmediate(resolve)); render(); render();
  assert.equal(spoken.visible, true); assert.match(spoken.message.text, /800 francs congolais.*jetons/);
  active = false; render(); assert.equal(spoken.visible, false);
  active = true; user = { id: 'other-driver', role: 'driver' }; render();
  assert.equal(spoken.visible, false, 'old-account cached trips cannot describe a payment to the next account');
  await new Promise(resolve => setImmediate(resolve)); render(); render();
  assert.equal(spoken.visible, false);
  hooks.unmount();
});
