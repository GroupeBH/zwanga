const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const { getNavigationContacts, isNavigationParticipant } = loader()('features/navigation/navigationContacts.ts');
const trip = { id: 'trip', driverId: 'driver', driverName: 'Conducteur', driver: { id: 'driver', phone: '+243999111222' } };
const booking = { id: 'booking', tripId: 'trip', passengerId: 'passenger', passengerName: 'Passager', passengerPhone: '0999333444', status: 'accepted' };
const driverContext = { role: 'driver', userId: 'driver', trip, bookings: [booking] };
const passengerContext = { role: 'passenger', userId: 'passenger', trip, booking };
const all = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props?.children)];
const words = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join('') : node?.props ? words(node.props.children) : '';
const native = { View: 'View', Text: 'Text', ScrollView: 'ScrollView', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: value => value, absoluteFill: {} } };
const flush = () => new Promise(resolve => setImmediate(resolve));

test('navigation contacts use the actual role in this trip, not the account driver capability', () => {
  assert.deepEqual(getNavigationContacts(driverContext).map(person => person.id), ['passenger']);
  assert.deepEqual(getNavigationContacts(passengerContext).map(person => person.id), ['driver']);
  assert.deepEqual(getNavigationContacts({ ...driverContext, userId: 'passenger' }), []);
  assert.deepEqual(getNavigationContacts({ ...passengerContext, userId: 'stranger' }), []);
  assert.deepEqual(getNavigationContacts({ ...passengerContext, booking: { ...booking, tripId: 'another' } }), []);
  assert.equal(isNavigationParticipant({ ...driverContext, userId: undefined }), false);
  assert.equal(isNavigationParticipant({ ...passengerContext, booking: undefined }), false);
  assert.equal(isNavigationParticipant({ ...driverContext, trip: undefined }), false);
});

test('driver contacts exclude other trips, rejected bookings and passengers already dropped off', () => {
  const bookings = [booking, { ...booking },
    ...['pending', 'rejected', 'cancelled', 'completed'].map(status => ({ ...booking, passengerId: status, status })),
    { ...booking, passengerId: 'wrong-trip', tripId: 'other' },
    { ...booking, passengerId: 'dropped', droppedOff: true },
    { ...booking, passengerId: 'confirmed', droppedOffConfirmedByPassenger: true },
    { ...booking, passengerId: 'dropped-at', droppedOffAt: '2026-09-16T06:00:00Z' },
    { ...booking, passengerId: 'confirmed-at', droppedOffConfirmedAt: '2026-09-16T06:00:00Z' },
    { ...booking, passengerId: 'uncertain', status: 'boarding_uncertain', pickedUp: true },
  ].map(Object.freeze);
  const contacts = getNavigationContacts({ ...driverContext, bookings: Object.freeze(bookings) });
  assert.deepEqual(contacts.map(person => person.id), ['passenger', 'uncertain']);
  assert.equal(contacts[0].detail, 'À prendre en charge');
  assert.equal(contacts[1].detail, 'À bord');
});

test('authorized trip passenger data supplies a missing booking phone, but never another booking phone', () => {
  const context = { ...driverContext, bookings: [{ ...booking, passengerName: undefined, passengerPhone: null }],
    trip: { ...trip, passengers: [{ id: 'passenger', bookingId: 'booking', phone: '0999000111', name: 'Nom complet' }] } };
  assert.equal(getNavigationContacts(context)[0].phone, '0999000111');
  assert.equal(getNavigationContacts(context)[0].name, 'Nom complet');
  context.trip.passengers[0].bookingId = 'different';
  assert.equal(getNavigationContacts(context)[0].phone, null);
});

test('missing or invalid numbers remain explicit unavailable contacts', () => {
  for (const phone of [null, undefined, '', '   ', 'aucun', '123', '1234567890123456']) {
    assert.equal(getNavigationContacts({ ...driverContext, bookings: [{ ...booking, passengerPhone: phone }] })[0].phone, null);
    assert.equal(getNavigationContacts({ ...passengerContext, trip: { ...trip, driver: { phone } } })[0].phone, null);
  }
  assert.equal(getNavigationContacts({ ...passengerContext, trip: { ...trip, driver: undefined } })[0].phone, null);
});

test('assistance opens only on request, memoizes contacts and clears on background, route or account changes', () => {
  const hooks = hookHarness();
  const state = { auth: { user: { id: 'driver' } } };
  const { useNavigationAssistance } = loader({ react: hooks.react, '@/store/hooks': { useAppSelector: fn => fn(state) } })('hooks/navigation/useNavigationAssistance.ts');
  const props = { ...driverContext, isScreenActive: true };
  const render = () => hooks.render(() => useNavigationAssistance(props));
  let result = render();
  assert.equal(result.panel, null); assert.deepEqual(result.contacts, []);
  result.openContacts(); result = render();
  assert.equal(result.panel, 'contacts'); assert.equal(result.contacts.length, 1);
  assert.equal(render().contacts, result.contacts);
  result.close(); result = render(); assert.equal(result.isOpen, false);
  result.openSos(); result = render(); assert.equal(result.panel, 'sos'); assert.deepEqual(result.contacts, []);
  props.isScreenActive = false; result = render(); assert.equal(result.panel, null);
  result.openContacts(); props.isScreenActive = true; result = render(); assert.equal(result.panel, null);
  result.openContacts(); render(); props.trip = { ...trip, id: 'new-trip' }; render();
  assert.equal(render().panel, null);
  render().openSos(); render(); state.auth.user.id = 'stranger'; result = render();
  assert.equal(result.enabled, false); result.openContacts(); assert.equal(render().panel, null);
  hooks.unmount();
});

for (const role of ['driver', 'passenger']) {
  test(`${role}: visible text actions dispatch contact/SOS separately`, () => {
    const calls = [];
    const { NavigationAssistanceButtons } = loader({ react: { ...React, memo: component => component }, 'react-native': native,
      '@expo/vector-icons': { Ionicons: 'Icon' } })('features/navigation/NavigationAssistanceButtons.tsx');
    const props = { role, onContact: () => calls.push('contact'), onSos: () => calls.push('sos') };
    const buttons = all(NavigationAssistanceButtons(props)).filter(node => node.type === 'Button');
    assert.deepEqual(buttons.map(words), ['Contacter', 'SOS']); assert.deepEqual(calls, []);
    buttons.forEach(button => button.props.onPress()); assert.deepEqual(calls, ['contact', 'sos']);
    assert.ok(all(NavigationAssistanceButtons({ ...props, disabled: true })).filter(node => node.type === 'Button').every(button => button.props.disabled));
  });
}

function contactModal(phones = {}) {
  const hooks = hookHarness(); const calls = [];
  const { NavigationContactModal } = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' }, '@/components/forms/FormLayout': { FormModal: 'Modal' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/utils/phoneHelpers': { openPhoneCall: async (...args) => { calls.push(['phone', args[0]]); await phones.phone?.(...args); },
      openWhatsApp: async (...args) => { calls.push(['whatsapp', args[0]]); await phones.whatsapp?.(...args); } },
  })('features/navigation/NavigationContactModal.tsx');
  const props = { role: 'driver', contacts: [
    { id: 'one', name: 'Alice', phone: '0999000111', detail: 'À bord' },
    { id: 'two', name: 'Bob', phone: '0999000222', detail: 'À prendre en charge' },
    { id: 'three', name: 'Charles', phone: null, detail: 'À prendre en charge' },
  ], onClose() {} };
  let tree; const render = () => { tree = hooks.render(() => NavigationContactModal(props)); return tree; };
  const button = label => all(tree).find(node => node.type === 'Button' && node.props.accessibilityLabel === label);
  render(); return { calls, hooks, props, render, button, tree: () => tree };
}

test('contact sheet shows each person, reserves the bottom safe area and never opens external apps on mount', async () => {
  const h = contactModal();
  assert.deepEqual(h.calls, []); assert.match(words(h.tree()), /Alice.*Bob.*Charles/);
  const sheet = all(h.tree()).find(node => node.type === 'SafeAreaView');
  assert.equal(sheet.props.style.maxHeight, '85%'); assert.ok(sheet.props.edges.includes('bottom'));
  assert.equal(h.button('Appeler Charles').props.disabled, true);
  h.button('Appeler Charles').props.onPress(); assert.deepEqual(h.calls, []);
  h.button('Appeler Bob').props.onPress(); await flush(); h.render();
  assert.deepEqual(h.calls, [['phone', '0999000222']]);
  h.button('Contacter sur WhatsApp Alice').props.onPress(); await flush();
  assert.deepEqual(h.calls.at(-1), ['whatsapp', '0999000111']); h.hooks.unmount();
});

test('contact sheet locks double taps synchronously and tolerates leaving during an external call', async () => {
  let resolve;
  const h = contactModal({ phone: () => new Promise(done => { resolve = done; }) });
  h.button('Appeler Bob').props.onPress(); h.button('Appeler Alice').props.onPress();
  h.render(); assert.equal(h.button('Contacter sur WhatsApp Alice').props.disabled, true);
  assert.equal(h.calls.length, 1); h.hooks.unmount(); resolve(); await flush();
  assert.equal(h.calls.length, 1);
});

test('contact sheet displays French errors and offers a retry instead of leaking native errors', async () => {
  const h = contactModal({ phone: async () => { throw new Error('ActivityNotFoundException'); } });
  h.button('Appeler Alice').props.onPress(); await flush(); h.render();
  assert.match(words(h.tree()), /Impossible d’ouvrir ce moyen de contact/);
  assert.doesNotMatch(words(h.tree()), /ActivityNotFoundException/);
  assert.equal(h.button('Appeler Alice').props.disabled, false); h.hooks.unmount();
});

test('assistance mounts only the requested sheet and yields to location permission disclosure', () => {
  const { NavigationAssistanceModals } = loader({
    '@/features/trip-detail/TripSosModal': { TripSosModal: 'SOS' }, './NavigationContactModal': { NavigationContactModal: 'Contacts' },
  })('features/navigation/NavigationAssistanceModals.tsx');
  const props = { assistance: { panel: null, contacts: [], close() {} }, role: 'passenger', insets: { bottom: 34 } };
  assert.equal(NavigationAssistanceModals(props), null);
  props.assistance.panel = 'sos'; assert.equal(NavigationAssistanceModals(props).type, 'SOS');
  assert.equal(NavigationAssistanceModals(props).props.closeSosModal, props.assistance.close);
  assert.equal(NavigationAssistanceModals({ ...props, blocked: true }), null);
  props.assistance.panel = 'contacts'; assert.equal(NavigationAssistanceModals(props).type, 'Contacts');
});

test('SOS lists the existing emergency contacts and never calls on opening', () => {
  const calls = []; const hooks = hookHarness();
  const load = loader({ react: { ...React, ...hooks.react }, 'react-native': { ...native, Modal: 'Modal', Linking: { openURL: async url => calls.push(url) } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '../screen-styles/app/trip/detail/index': { styles: {} },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog() {} }) },
    '@/constants/policeContacts': { POLICE_CONTACTS: [{ id: 'test-only', label: 'Numéro de test', phone: '123456' }] },
  });
  const { TripSosModal } = load('features/trip-detail/TripSosModal.tsx');
  const tree = TripSosModal({ sosModalVisible: true, closeSosModal() {}, insets: { bottom: 34 } });
  assert.equal(tree.props.visible, true);
  const { PoliceContactPanel } = load('components/PoliceContactPanel.tsx');
  hooks.render(() => PoliceContactPanel({})); assert.deepEqual(calls, []); hooks.unmount();
});

function phoneHelpers(openURL) {
  return loader({ 'react-native': { Linking: { openURL, canOpenURL() { throw new Error('must not query native visibility'); } } } })('utils/phoneHelpers.ts');
}
test('calling uses the phone app directly even without native package visibility queries', async () => {
  const calls = []; const h = phoneHelpers(async url => calls.push(url));
  await h.openPhoneCall('0999 000 111'); await h.openPhoneCall('00243 999 000 222');
  assert.deepEqual(calls, ['tel:+243999000111', 'tel:+243999000222']);
  const errors = []; await h.openPhoneCall('aucun', message => errors.push(message));
  assert.equal(calls.length, 2); assert.deepEqual(errors, ['Numéro de téléphone invalide.']);
});
test('an unavailable or cancelled phone opening reports a friendly error with no automatic retry', async () => {
  let count = 0; const errors = [];
  const h = phoneHelpers(async () => { count++; throw new Error('native English failure'); });
  await h.openPhoneCall('0999000111', message => errors.push(message));
  assert.equal(count, 1); assert.match(errors[0], /L’appel n’a pas été ouvert/);
});
test('WhatsApp tries the installed app before its web fallback, reporting a friendly final error', async () => {
  const calls = []; const errors = [];
  const h = phoneHelpers(async url => { calls.push(url); throw new Error('no application'); });
  await h.openWhatsApp('0999000111', message => errors.push(message));
  assert.deepEqual(calls, ['whatsapp://send?phone=243999000111', 'https://wa.me/243999000111']);
  assert.deepEqual(errors, ["Impossible d'ouvrir WhatsApp."]);
});
