const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const noop = () => {};
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const nodes = n => Array.isArray(n) ? n.flatMap(nodes) : React.isValidElement(n) ? [n, ...nodes(n.props.children)] : [];
const words = n => Array.isArray(n) ? n.map(words).join(' ') : React.isValidElement(n) ? words(n.props.children) : typeof n === 'string' ? n : '';
const native = { View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', ScrollView: 'Scroll',
  Switch: 'Switch', FlatList: 'List', ActivityIndicator: 'Spinner', RefreshControl: 'Refresh',
  Platform: { OS: 'android' }, StyleSheet: { create: x => x } };
const common = {
  'react-native-safe-area-context': { SafeAreaView: 'Safe' }, '@expo/vector-icons': { Ionicons: 'Icon' },
  '@/utils/reanimated': { __esModule: true, default: { View: 'Animated' }, FadeInDown: { delay: noop } },
};

function scopeFixture() {
  const hooks = hookHarness(), state = { user: { id: 'account-a', role: 'driver' }, active: true, version: 1 };
  return { hooks, state, mocks: {
    react: { ...React, ...hooks.react },
    '@/store/hooks': { useAppSelector: () => state.user, useAppDispatch: () => noop },
    '@/store/selectors': { selectUser: noop },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/services/tokenSession': { getTokenSessionVersion: () => state.version },
  } };
}

function actionFixture(kind) {
  const f = scopeFixture(), calls = [], dialogs = [], changes = [], pending = [];
  const mutation = body => { calls.push(body); const p = deferred(); pending.push(p); return { unwrap: () => p.promise }; };
  const setters = Object.fromEntries(['setShowEditModal', 'setShowAddModal', 'setSelectedLocation', 'setLocationName',
    'setLocationType', 'setIsDefault', 'setNotes', 'setEditingLocation', 'setTicketSubject', 'setTicketMessage',
    'setTicketCategory', 'setShowTicketModal'].map(key => [key, value => changes.push([key, value])]));
  const params = { ...setters, showDialog: d => dialogs.push(d), refetch: noop, refetchTickets: noop,
    refetchSupportConfig: noop, refetchFaq: noop, selectedLocation: { latitude: -4.3, longitude: 15.3, address: 'Test' },
    locationName: 'Test', locationType: 'other', notes: 'Test', editingLocation: null, isDefault: false,
    updateFavoriteLocation: mutation, createFavoriteLocation: mutation, deleteFavoriteLocation: noop,
    ticketSubject: 'Test', ticketMessage: 'Synthetic test', ticketCategory: 'other', createSupportTicket: mutation,
    persistFavoriteContact: async () => {} };
  const load = loader({ ...f.mocks, '@/utils/errorHelpers': { getApiErrorMessage: () => 'Test error' },
    '@/components/support/supportData': { buildApiErrorMessage: () => 'Test error' } });
  const useAction = kind === 'favorite' ? load('hooks/favorites/useFavoriteLocationActions.ts').useFavoriteLocationActions
    : load('hooks/support/useSupportTicketActions.ts').useSupportTicketActions;
  const render = () => f.hooks.render(() => useAction(params));
  const submit = () => { const a = render(); return kind === 'favorite' ? a.handleSaveLocation : a.handleSubmitTicket; };
  return { ...f, calls, dialogs, changes, pending, params, render, submit };
}

for (const kind of ['favorite', 'support']) {
  test(`${kind}: synchronous duplicate taps send once; failure preserves draft and permits retry`, async () => {
    const f = actionFixture(kind), submit = f.submit();
    const a = submit(), b = submit();
    assert.equal(f.calls.length, 1);
    f.pending[0].reject({ status: 503 }); await Promise.all([a, b]);
    assert.equal(f.changes.length, 0); assert.equal(f.dialogs[0].variant, 'danger');
    const retry = f.submit()(); f.pending[1].resolve({ id: 'test' }); await retry;
    assert.equal(f.calls.length, 2); assert.equal(f.dialogs[1].variant, 'success');
    assert.ok(f.changes.length > 0); f.hooks.unmount();
  });
  test(`${kind}: invalid inputs do not submit`, async () => {
    const f = actionFixture(kind);
    if (kind === 'favorite') f.params.selectedLocation = null; else f.params.ticketSubject = ' ';
    await f.submit()(); assert.equal(f.calls.length, 0); assert.equal(f.dialogs[0].variant, 'warning');
    f.hooks.unmount();
  });
  for (const transition of ['blur', 'account', 'logout', 'unmount']) test(`${kind}: ${transition} ignores a late success`, async () => {
    const f = actionFixture(kind), promise = f.submit()();
    if (transition === 'blur') { f.state.active = false; f.render(); f.state.active = true; f.render(); }
    if (transition === 'account') { f.state.user = { id: 'account-b' }; f.render(); }
    if (transition === 'logout') f.state.version++;
    if (transition === 'unmount') f.hooks.unmount();
    f.pending[0].resolve({ id: 'test' }); await promise;
    assert.equal(f.dialogs.length, 0); assert.equal(f.changes.length, 0); f.hooks.unmount();
  });
}
test('favorite update is protected as well as creation', async () => {
  const f = actionFixture('favorite'); f.params.editingLocation = { id: 'existing' };
  const submit = f.submit(), a = submit(), b = submit();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].id, 'existing');
  f.pending[0].resolve({}); await Promise.all([a, b]); f.hooks.unmount();
});
test('support: closing during submission cannot clear the pending draft', async () => {
  const f = actionFixture('support'), actions = f.render(), promise = actions.handleSubmitTicket();
  actions.handleCloseTicketModal(); assert.equal(f.changes.length, 0);
  f.pending[0].reject({ status: 503 }); await promise;
  f.render().handleCloseTicketModal(); assert.ok(f.changes.length > 0); f.hooks.unmount();
});

function favoritesFixture() {
  const hooks = hookHarness(), state = { data: undefined, isLoading: false, isFetching: false, isError: false };
  let retries = 0;
  const Screen = loader({ ...common, react: { ...React, ...hooks.react }, 'react-native': native,
    'expo-router': { useRouter: () => ({ back: noop }) }, '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: noop }) },
    '../features/screen-styles/app/favorite-locations/index': { styles: {} },
    '@/components/forms/FormLayout': { FormModal: 'Modal' }, '@/components/LocationPickerModal': { default: 'Picker' },
    '../hooks/favorites/useFavoriteLocationEditor': { useFavoriteLocationEditor: () => ({}) },
    '../hooks/favorites/useFavoriteLocationActions': { useFavoriteLocationActions: () => ({}) },
    '@/store/api/userApi': { useGetFavoriteLocationsQuery: () => ({ ...state, refetch: () => retries++ }),
      useCreateFavoriteLocationMutation: () => [noop, {}], useUpdateFavoriteLocationMutation: () => [noop, {}], useDeleteFavoriteLocationMutation: () => [noop, {}] },
  })('app/favorite-locations.tsx').default;
  return { state, hooks, render: () => hooks.render(Screen), retries: () => retries };
}
test('favorites: initial loading, successful empty list, failure and retry are distinct', () => {
  const f = favoritesFixture(); f.state.isLoading = true;
  assert.match(words(f.render()), /Chargement des lieux/); assert.doesNotMatch(words(f.render()), /Aucun lieu favori/);
  f.state.isLoading = false; f.state.isError = true;
  const failed = f.render(); assert.match(words(failed), /Lieux favoris indisponibles/); assert.doesNotMatch(words(failed), /Aucun lieu favori/);
  nodes(failed).find(n => n.type === 'Button' && words(n) === 'Réessayer').props.onPress(); assert.equal(f.retries(), 1);
  f.state.isError = false; f.state.data = []; assert.match(words(f.render()), /Aucun lieu favori/); f.hooks.unmount();
});
test('favorites: failed refresh retains cached places and offers retry', () => {
  const f = favoritesFixture(); f.state.data = [{ id: 'test', name: 'Lieu synthétique', type: 'home', address: 'Test' }]; f.state.isError = true;
  assert.match(words(f.render()), /Lieu synthétique/); assert.match(words(f.render()), /Actualisation impossible/);
  assert.doesNotMatch(words(f.render()), /Aucun lieu favori/);
  f.state.isFetching = true;
  assert.equal(nodes(f.render()).find(n => n.type === 'Button' && words(n) === 'Actualisation…').props.disabled, true); f.hooks.unmount();
});

function paymentFixture() {
  const f = scopeFixture(), pending = new Map(), dialogs = [], params = {};
  const payments = ['A', 'B'].map(id => ({ id, reference: `TEST-${id}`, amount: 1000, currency: 'CDF', status: 'succeeded', method: 'cash', createdAt: '2026-11-27T10:00:00Z' }));
  const request = id => { const p = deferred(); pending.set(id, p); return { unwrap: () => p.promise }; };
  const showDialog = d => dialogs.push(d);
  const Screen = loader({ ...common, ...f.mocks, 'react-native': native,
    'expo-router': { useRouter: () => ({ back: noop }), useLocalSearchParams: () => params },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog }) },
    '@/hooks/useHistoryCursor': { useHistoryCursor: () => ({ page: 1, next: noop, previous: noop }) },
    '@/components/ui/HistoryPagination': { HistoryPagination: 'Pagination' }, '@/features/navigation/RideModal': { RideModal: 'Modal' },
    '../features/screen-styles/app/payment-history/index': { styles: {} },
    '../hooks/payment-history/usePaymentReceiptDownload': { usePaymentReceiptDownload: () => ({ handleDownloadPayment: noop }) },
    '@/store/api/paymentApi': { useGetPaymentHistoryPageQuery: () => ({ currentData: { data: payments }, refetch: noop }),
      useGetPaymentHistorySummaryQuery: () => ({ refetch: noop }), useLazyGetPaymentDetailsQuery: () => [request] },
  })('app/payment-history.tsx').default;
  const render = () => f.hooks.render(Screen);
  const open = id => {
    const list = nodes(render()).find(n => n.type === 'List');
    return nodes(list.props.renderItem({ item: payments.find(p => p.id === id) })).find(n => n.props.accessibilityLabel === 'Voir le détail du paiement').props.onPress();
  };
  return { ...f, pending, payments, dialogs, params, render, open };
}
test('payments: older success cannot replace newer selection or clear its loader', async () => {
  const f = paymentFixture(), a = f.open('A'), b = f.open('B');
  f.pending.get('A').resolve(f.payments[0]); await a;
  assert.equal(nodes(f.render()).find(n => n.type === 'List').props.extraData.loadingDetailsPaymentId, 'B');
  f.pending.get('B').resolve(f.payments[1]); await b;
  assert.match(words(f.render()), /TEST-B/); assert.doesNotMatch(words(f.render()), /TEST-A/); f.hooks.unmount();
});
test('payments: B then A responses keep B visible', async () => {
  const f = paymentFixture(), a = f.open('A'), b = f.open('B');
  f.pending.get('B').resolve(f.payments[1]); await b;
  f.pending.get('A').resolve(f.payments[0]); await a;
  assert.match(words(f.render()), /TEST-B/); assert.doesNotMatch(words(f.render()), /TEST-A/); f.hooks.unmount();
});
test('payments: old failure is silent; current failure shows an error', async () => {
  const f = paymentFixture(), a = f.open('A'), b = f.open('B');
  f.pending.get('A').reject({ status: 503 }); await a; assert.equal(f.dialogs.length, 0);
  f.pending.get('B').reject({ status: 503 }); await b; assert.equal(f.dialogs.length, 1); f.hooks.unmount();
});
test('payments: incoming link and manual selection share the same ordering guard', async () => {
  const f = paymentFixture(); f.params.paymentId = 'A'; f.render(); const b = f.open('B');
  f.pending.get('B').resolve(f.payments[1]); await b;
  f.pending.get('A').resolve(f.payments[0]); await tick();
  assert.match(words(f.render()), /TEST-B/); assert.doesNotMatch(words(f.render()), /TEST-A/); f.hooks.unmount();
});
for (const transition of ['blur', 'account', 'logout', 'unmount']) test(`payments: ${transition} ignores a pending detail`, async () => {
  const f = paymentFixture(), a = f.open('A');
  if (transition === 'blur') { f.state.active = false; f.render(); f.state.active = true; f.render(); }
  if (transition === 'account') { f.state.user = { id: 'account-b' }; f.render(); }
  if (transition === 'logout') f.state.version++;
  if (transition === 'unmount') f.hooks.unmount();
  f.pending.get('A').resolve(f.payments[0]); await a;
  if (transition !== 'unmount') assert.doesNotMatch(words(f.render()), /TEST-A/);
  assert.equal(f.dialogs.length, 0); f.hooks.unmount();
});
test('payments: closed details are not reopened by an older response', async () => {
  const f = paymentFixture(), a = f.open('A'), b = f.open('B');
  f.pending.get('B').resolve(f.payments[1]); await b;
  nodes(f.render()).find(n => n.props.accessibilityLabel === 'Fermer le détail du paiement').props.onPress();
  f.pending.get('A').resolve(f.payments[0]); await a;
  assert.equal(nodes(f.render()).some(n => n.type === 'Modal'), false); f.hooks.unmount();
});
test('payments: wrong receipt identity is never displayed', async () => {
  const f = paymentFixture(), a = f.open('A'); f.pending.get('A').resolve(f.payments[1]); await a;
  assert.equal(nodes(f.render()).some(n => n.type === 'Modal'), false); assert.equal(f.dialogs.length, 1); f.hooks.unmount();
});

function settingsFixture() {
  const f = scopeFixture(), calls = [], dialogs = []; let fail = false;
  const Screen = loader({ ...common, ...f.mocks, 'react-native': { ...native, Linking: { openSettings: async () => { calls.push('os-location'); if (fail) throw Error('test'); } } },
    'expo-router': { useRouter: () => ({ back: noop, push: path => calls.push(path) }) },
    '../hooks/settings/useSettingsAccountActions': { useSettingsAccountActions: () => ({ accountItems: [], handleDeleteAccount: noop }) },
    '../features/screen-styles/app/settings/index': { styles: {} },
    '@/components/UpdateAnnouncementsChoice': { UpdateAnnouncementsChoice: 'Updates' },
    '@/components/TutorialOverlay': { TutorialOverlay: 'Tutorial' },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: d => dialogs.push(d), hideDialog: noop }) },
    '@/contexts/TutorialContext': { useTutorialGuide: () => ({ shouldShow: false, complete: noop }) },
    '@/hooks/useProfilePhoto': { useProfilePhoto: () => ({ changeProfilePhoto: noop }) },
    '@/store/api/userApi': { useDeleteAccountMutation: () => [noop, {}] },
    '@/services/driverAlertChannel': { openDriverAlertSettings: async () => { calls.push('os-notifications'); if (fail) throw Error('test'); } },
  })('app/settings.tsx').default;
  return { ...f, calls, dialogs, render: () => f.hooks.render(Screen), fail: () => { fail = true; } };
}
test('settings: unsupported switches removed, updates retained, language genuinely read-only', () => {
  const f = settingsFixture(), tree = f.render();
  assert.equal(nodes(tree).filter(n => n.type === 'Switch').length, 0);
  assert.equal(nodes(tree).filter(n => n.type === 'Updates').length, 1);
  assert.equal(nodes(tree).some(n => n.type === 'Button' && words(n).includes('Langue')), false);
  assert.match(words(tree), /Langue Français/); assert.doesNotMatch(words(tree), /Mode sombre|Acceptation automatique|Afficher mon numéro/); f.hooks.unmount();
});
test('settings: driver location opens real availability settings; passenger opens OS permissions', async () => {
  const f = settingsFixture(), press = () => nodes(f.render()).find(n => n.props.accessibilityLabel === 'Gérer la localisation').props.onPress();
  press(); assert.deepEqual(f.calls, ['/driver-availability']);
  f.state.user.role = 'passenger'; press(); await tick(); assert.equal(f.calls[1], 'os-location');
  f.fail(); press(); await tick(); assert.equal(f.dialogs[0].title, 'Réglages indisponibles'); f.hooks.unmount();
});
test('settings: sound settings still work and report OS errors', async () => {
  const f = settingsFixture(), press = () => nodes(f.render()).find(n => n.props.accessibilityLabel === 'Régler la sonnerie et les vibrations').props.onPress();
  press(); await tick(); assert.equal(f.calls[0], 'os-notifications');
  f.fail(); press(); await tick(); assert.equal(f.dialogs[0].title, 'Réglages indisponibles'); f.hooks.unmount();
});

test('support: actual parent still reports success if optional AsyncStorage preference fails', async () => {
  const f = scopeFixture(), dialogs = []; let created = 0, refreshes = 0;
  const Screen = loader({ ...common, ...f.mocks, 'react-native': native,
    'expo-router': { useRouter: () => ({ back: noop }) },
    '@react-native-async-storage/async-storage': { setItem: async () => { throw Error('test storage failure'); } },
    '@/components/support/supportStyles': { styles: {} },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: d => dialogs.push(d.title) }) },
    '@/components/support/SupportTicketCard': { SupportTicketCard: 'Ticket' },
    '../features/support/SupportTicketModal': { SupportTicketModal: 'TicketModal' },
    '../hooks/support/useSupportContactActions': { useSupportContactActions: () => ({ handleQuickAction: noop }) },
    '../hooks/support/useSupportData': { useSupportData: () => ({
      setFavoriteContact: noop, setRecentFaqs: noop, setRecentSearches: noop, setExpandedFaqId: noop,
      setTicketSubject: noop, setTicketMessage: noop, setTicketCategory: noop, setShowTicketModal: noop,
      ticketSubject: 'Test', ticketMessage: 'Synthetic test', ticketCategory: 'other',
      refetchSupportConfig: noop, refetchFaq: noop,
      supportConfig: { hours: [] }, quickActions: [], myTickets: [], recentFaqEntries: [], recentSearches: [], filteredFaqEntries: [], groupedFaqEntries: {},
      canCreateTicket: true, showTicketModal: true,
      createSupportTicket: () => ({ unwrap: async () => { created++; return { id: 'synthetic' }; } }),
      refetchTickets: () => { refreshes++; },
    }) },
  })('app/support.tsx').default;
  const form = nodes(f.hooks.render(Screen)).find(n => n.type === 'TicketModal');
  await form.props.handleSubmitTicket();
  assert.equal(created, 1); assert.equal(refreshes, 1); assert.deepEqual(dialogs, ['Ticket envoyé']); f.hooks.unmount();
});

function documentFixture() {
  const parent = hookHarness(), child = hookHarness(); let currentHooks = parent;
  const react = { ...React, ...Object.fromEntries(Object.keys(parent.react).map(key => [key, (...args) => currentHooks.react[key](...args)])) };
  const offering = { code: 'documents', name: 'Documents', availability: 'open', documentOptions: [{ code: 'permis', label: 'Permis' }] };
  const state = { active: true, user: { id: 'account-a', name: 'Compte test', phone: '0000000000' },
    query: { currentData: { request: null }, isFetching: false, isError: false }, catalogue: [offering] };
  const flight = deferred(), calls = [];
  const load = loader({ ...common, react, 'react-native': { ...native, Keyboard: { dismiss: noop }, BackHandler: { addEventListener: () => ({ remove: noop }) } },
    'expo-router': { useLocalSearchParams: () => ({ service: 'documents' }), router: { replace: route => calls.push(route) } },
    '@/store/hooks': { useAppSelector: () => state.user }, '@/store/selectors': { selectUser: noop },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    '@/features/pro-services/ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Button', s: {} },
    './ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Button', s: {} },
    './ServiceFormFields': { ServiceNeedStep: 'Need', ServiceContactStep: 'Contact' },
    './ServiceFormReview': { ServiceFormReview: 'Review' }, './ServiceForm.styles': { f: {} },
    '@/store/api/proServicesApi': {
      useGetProOfferingsQuery: () => ({ data: state.catalogue }), useGetCurrentDocumentCaseQuery: () => state.query,
      useCreateProCaseMutation: () => [body => { calls.push(body); return { unwrap: () => flight.promise }; }, {}],
      useUpdateDocumentCaseMutation: () => [noop, {}],
    },
  });
  const Screen = load('app/services/new.tsx').default;
  const Form = load('features/pro-services/ServiceRequestForm.tsx').ServiceRequestForm;
  const renderParent = () => { currentHooks = parent; return parent.render(Screen); };
  const renderChild = element => { currentHooks = child; return child.render(() => element.type(element.props)); };
  const controller = () => nodes(renderChild(renderParent())).find(n => ['Need', 'Contact', 'Review'].includes(n.type)).props.controller;
  return { state, calls, flight, Form, renderParent, renderChild, controller, close: () => { parent.unmount(); child.unmount(); } };
}
test('documents: actual parent and form retain success through pre-response invalidation/refetch', async () => {
  const f = documentFixture(), initial = f.renderParent(); assert.equal(initial.type, f.Form);
  f.controller().change('documents', ['permis']); f.controller().next(); f.controller().next(); f.controller().toggleConsent();
  const sending = f.controller().submit(); assert.equal(f.calls.length, 1);
  f.state.query = { isFetching: true, currentData: undefined };
  const refreshing = f.renderParent(); assert.equal(refreshing.type, f.Form); assert.equal(refreshing.key, initial.key);
  f.state.query = { isFetching: false, currentData: { request: { id: 'new-case', canEdit: true } } };
  assert.equal(f.renderParent().type, f.Form);
  f.flight.resolve({ id: 'new-case' }); await sending;
  const success = f.renderChild(f.renderParent());
  assert.equal(success.props.title, 'Demande envoyée'); assert.match(words(success), /Votre demande a bien été reçue/);
  nodes(success.props.footer).find(n => n.props.title === 'Suivre mon dossier').props.onPress();
  assert.equal(f.calls[1], '/services/new-case'); f.close();
});
test('documents: initial error/existing case still block creation; account switch resets admission', () => {
  const f = documentFixture(); f.state.query = { isError: true };
  assert.notEqual(f.renderParent().type, f.Form);
  f.state.query = { currentData: { request: { id: 'old-case', canEdit: true } } };
  assert.notEqual(f.renderParent().type, f.Form);
  f.state.query = { currentData: { request: null }, isFetching: false };
  assert.equal(f.renderParent().type, f.Form);
  f.state.query = { currentData: { request: { id: 'other-case', canEdit: true } } };
  f.state.user = { ...f.state.user, id: 'account-b' };
  assert.notEqual(f.renderParent().type, f.Form);
  f.state.user = { ...f.state.user, id: 'account-a' };
  assert.notEqual(f.renderParent().type, f.Form); assert.equal(f.calls.length, 0); f.close();
});
test('documents: failed refetch during an admitted draft cannot erase it', () => {
  const f = documentFixture(); f.controller().change('documents', ['permis']);
  f.state.query = { isError: true, currentData: undefined };
  assert.equal(f.renderParent().type, f.Form); assert.deepEqual(f.controller().form.documents, ['permis']); f.close();
});

test('receipt: an old download cannot replace a detail; late account response cannot share', async () => {
  for (const stale of [false, true]) {
    const f = scopeFixture(), flight = deferred(), events = [];
    const params = { isDownloadingRef: { current: false }, setDownloadingPaymentId: noop, selectedPayment: null,
      getPaymentDetails: () => ({ unwrap: () => flight.promise }), closeDetails: id => events.push(['close', id]), showDialog: d => events.push(['dialog', d.title]) };
    const { usePaymentReceiptDownload } = loader({ ...f.mocks, 'react-native': native,
      'expo-sharing': { isAvailableAsync: async () => true, shareAsync: async (uri, options) => events.push(['share', options.dialogTitle]) },
      'expo-file-system/legacy': { documentDirectory: '/test/', EncodingType: { Base64: 'base64' }, writeAsStringAsync: async () => events.push(['file']) },
      '../../features/payment-history/paymentReceipt': { buildPaymentPdfBase64: d => { events.push(['pdf', d.id]); return 'test'; } },
      '../../features/payment-history/paymentHistoryModel': { sanitizeFileSegment: x => x, waitForNativePresentation: async () => {} },
    })('hooks/payment-history/usePaymentReceiptDownload.ts');
    const render = () => f.hooks.render(() => usePaymentReceiptDownload(params));
    const promise = render().handleDownloadPayment({ id: 'A' });
    params.selectedPayment = { id: 'B' }; render();
    if (stale) f.state.version++;
    flight.resolve({ id: 'A', reference: 'TEST-A' }); await promise;
    assert.equal(events.some(e => e[0] === 'close'), false);
    assert.equal(events.filter(e => e[0] === 'share').length, stale ? 0 : 1);
    if (!stale) assert.deepEqual(events.find(e => e[0] === 'pdf'), ['pdf', 'A']);
    assert.equal(params.isDownloadingRef.current, false); f.hooks.unmount();
  }
});
