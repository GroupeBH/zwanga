const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const { resolveInboxSection, inboxAttentionCount } = loader()('features/notifications/inboxSections.ts');
const native = { StyleSheet: { create: x => x }, View: 'View', Text: 'Text', TouchableOpacity: 'Button',
  ScrollView: 'ScrollView', FlatList: 'List', ActivityIndicator: 'Loading' };
const nodes = x => Array.isArray(x) ? x.flatMap(nodes) : React.isValidElement(x) ? [x, ...nodes(x.props.children)] : [];

test('inbox sections validate links; attention never doubles overlapping message notifications', () => {
  for (const value of [undefined, '', 'bogus', 'activity', []]) assert.equal(resolveInboxSection(value), 'activity');
  assert.equal(resolveInboxSection('support'), 'support');
  assert.equal(resolveInboxSection(['messages', 'support']), 'messages');
  assert.equal(inboxAttentionCount(0, 5), 5);
  assert.equal(inboxAttentionCount(5, 5), 5);
  assert.equal(inboxAttentionCount(NaN, -1), 0);
});

test('three accessible sections expose unread counts and preserve selected state', () => {
  const chosen = [];
  const { InboxHeader } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } })('features/notifications/InboxHeader.tsx');
  const tree = InboxHeader({ section: 'messages', unreadActivity: 4, unreadMessages: 120, onSelect: x => chosen.push(x), onBack() {} });
  const tabs = nodes(tree).filter(n => n.props.accessibilityRole === 'tab');
  assert.equal(tabs.length, 3);
  assert.deepEqual(tabs.map(t => t.props.accessibilityState.selected), [false, false, true]);
  assert.match(tabs[2].props.accessibilityLabel, /120 non lus/);
  tabs.forEach(t => t.props.onPress()); assert.deepEqual(chosen, ['activity', 'support', 'messages']);
});

test('hub mounts only the selected workspace; URL survives chat navigation and inactive input is ignored', () => {
  let section, active = true, canGoBack = false, dismissed = 0;
  const routes = [], skips = [];
  const Screen = loader({ 'react-native': { ...native, Keyboard: { dismiss: () => dismissed++ } },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    'expo-router': { useLocalSearchParams: () => ({ section }), useRouter: () => ({
      setParams: p => { section = p.section; }, canGoBack: () => canGoBack, back: () => routes.push('back'), replace: path => routes.push(path),
    }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/store/hooks': { useAppSelector: () => 5 }, '@/store/selectors': { selectUnreadMessagesCount() {} },
    '@/store/api/notificationApi': { useGetNotificationsQuery: (arg, opts) => { assert.deepEqual(arg, { limit: 1 }); skips.push(opts.skip); return { data: { unreadCount: 7 } }; } },
    '@/features/notifications/InboxHeader': { InboxHeader: 'Header' },
    '@/features/notifications/NotificationActivity': { default: 'Activity', __esModule: true },
    '@/features/notifications/SupportInbox': { SupportInbox: 'Support' },
    '@/features/messages/MessagesInbox': { default: 'Messages', __esModule: true },
  })('app/notifications.tsx').default;
  const header = () => Screen().props.children[0].props;
  assert.equal(Screen().props.children[1].type, 'Activity');
  header().onSelect('messages'); assert.equal(Screen().props.children[1].type, 'Messages');
  assert.equal(header().unreadMessages, 5); assert.equal(header().unreadActivity, 7);
  active = false; header().onSelect('support'); assert.equal(section, 'messages'); assert.equal(skips.at(-1), true);
  active = true; assert.equal(Screen().props.children[1].type, 'Messages');
  header().onSelect('support'); assert.equal(Screen().props.children[1].type, 'Support');
  assert.equal(dismissed, 2); header().onBack(); canGoBack = true; header().onBack();
  assert.deepEqual(routes, ['/(tabs)', 'back']);
});

test('legacy messages deep links lead to the new hub without an extra tab', () => {
  const Screen = loader({ 'expo-router': { Redirect: 'Redirect' } })('app/(tabs)/messages.tsx').default;
  assert.equal(Screen().props.href, '/notifications?section=messages');
});

test('the new search tab keeps the same ride-recovery eligibility as standalone search', () => {
  const load = loader();
  const { canResumeRideFromPath } = load('features/navigation/activeRideResume.ts');
  const { canResumeRequestFromPath } = load('features/navigation/priorityRequestEntry.ts');
  const { canAutoOpenBookingFromPath } = load('features/navigation/pendingBookingEntry.ts');
  for (const policy of [canResumeRideFromPath, canResumeRequestFromPath, canAutoOpenBookingFromPath]) {
    assert.equal(policy('/explore'), true); assert.equal(policy('/chat/conversation'), false);
  }
});

for (const platform of ['ios', 'android']) test(`${platform}: search remains inside the tab layout with appropriate bottom inset`, () => {
  const Screen = loader({ 'react-native': { ...native, Platform: { OS: platform } },
    '@react-navigation/bottom-tabs': { useBottomTabBarHeight: () => 90 },
    '../search': { default: 'Search', __esModule: true },
  })('app/(tabs)/explore.tsx').default;
  assert.equal(Screen().props.embedded, true);
  assert.equal(Screen().props.bottomOverlay, platform === 'ios' ? 90 : 0);
});

test('assistance uses bounded pages, exposes retry and pauses reads/actions when unfocused', () => {
  const h = hookHarness(), calls = [], routes = [];
  let active = true;
  const query = { currentData: { data: [{ id: 'ticket', status: 'waiting_user', subject: 'Question', updatedAt: '2026-11-25' }], meta: { total: 21 } }, isError: false, isFetching: false, refetch: () => calls.push('refresh') };
  const { SupportInbox } = loader({ react: { ...React, ...h.react }, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-router': { useRouter: () => ({ push: x => routes.push(x) }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/store/api/supportApi': { useGetMySupportTicketsQuery: (arg, opts) => { calls.push({ ...arg, skip: opts.skip }); return query; } },
  })('features/notifications/SupportInbox.tsx');
  const render = () => h.render(SupportInbox), button = (tree, label) => nodes(tree).find(n => n.type === 'Button' && nodes(n).some(t => t.props.children === label));
  let tree = render(); assert.deepEqual(calls[0], { page: 1, limit: 10, skip: false });
  assert.equal(tree.props.data[0].id, 'ticket');
  nodes(tree.props.ListHeaderComponent).find(n => n.type === 'Button').props.onPress(); assert.deepEqual(routes, ['/support']);
  button(tree.props.ListFooterComponent, 'Suivant').props.onPress(); tree = render(); assert.equal(calls.at(-1).page, 2);
  query.currentData = undefined; query.isError = true; tree = render();
  assert.equal(tree.props.data.length, 0); button(tree.props.ListEmptyComponent, 'Réessayer').props.onPress(); assert.equal(calls.at(-1), 'refresh');
  active = false; tree = render(); assert.equal(calls.at(-1).skip, true);
  const before = calls.length; tree.props.onRefresh(); button(tree.props.ListEmptyComponent, 'Réessayer').props.onPress(); assert.equal(calls.length, before);
  h.unmount();
});

test('a message without a notification still lights the Home bell and opens the hub', () => {
  const routes = [];
  const { HomeHeader } = loader({ 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' }, './HomeDriverStatus': { HomeDriverStatus: 'Status' } })('components/home/HomeHeader.tsx');
  const tree = HomeHeader.type({ insets: { top: 0 }, router: { push: x => routes.push(x) }, profileInitial: 'T', unreadNotifications: 0, unreadMessages: 3 });
  const bell = nodes(tree).find(n => n.props.accessibilityLabel?.includes('3 messages non lus'));
  assert.ok(bell); assert.ok(nodes(bell).some(n => n.type === 'Text' && n.props.children === 3));
  bell.props.onPress(); assert.deepEqual(routes, ['/notifications']);
});

test('large notification titles remain complete and decorative icons yield space to text', () => {
  for (const fontScale of [1, 2]) {
    const { NotificationListItem } = loader({ 'react-native': { ...native, useWindowDimensions: () => ({ fontScale }) },
      '@expo/vector-icons': { Ionicons: 'Icon' },
    })('features/notifications/NotificationListItem.tsx');
    const title = 'Votre commande est acceptée';
    const tree = NotificationListItem.type({ notification: { id: 'n', title, body: 'Votre conducteur arrive.', createdAt: new Date().toISOString() }, onPress() {}, onDelete() {} });
    assert.equal(nodes(tree).find(n => n.props.children === title).props.numberOfLines, fontScale > 1.3 ? undefined : 2);
    assert.equal(nodes(tree).filter(n => n.type === 'Icon').length, fontScale > 1.3 ? 1 : 2);
  }
});

test('the real embedded inbox opens one chat, keeps unread indicators and confirms deletion', async () => {
  const h = hookHarness(), routes = [], dialogs = [], deleted = [], skips = [];
  let active = true;
  const conversation = { id: 'chat', title: 'Personne de test', unreadCount: 2, lastMessage: { content: 'Bonjour', createdAt: new Date().toISOString() } };
  const Screen = loader({ react: { ...React, ...h.react }, 'react-native': { ...native, FlatList: 'List', Keyboard: { dismiss() {} }, Platform: { OS: 'ios' }, TextInput: 'Input' },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-router': { useRouter: () => ({ push: route => routes.push(route) }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/store/hooks': { useAppDispatch: () => () => {}, useAppSelector: select => select() },
    '@/store/selectors': { selectUser: () => ({ id: 'user' }), selectConversations: () => [conversation] },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: dialog => dialogs.push(dialog) }) },
    '@/store/api/messageApi': {
      useListConversationPagesInfiniteQuery: (_, opts) => { skips.push(opts.skip); return {}; },
      useDeleteConversationMutation: () => [args => ({ unwrap: async () => deleted.push(args) })],
    },
  })('features/messages/MessagesInbox.tsx').default;
  const render = () => h.render(Screen);
  const row = nodes(render()).find(n => n.type === 'List').props.renderItem({ item: conversation });
  const [open, remove] = nodes(row).filter(n => n.type === 'Button');
  assert.ok(nodes(row).some(n => n.props.children === 2));
  open.props.onPress(); open.props.onPress(); assert.equal(routes.length, 1);
  assert.deepEqual(routes[0], { pathname: '/chat/[id]', params: { id: 'chat', title: conversation.title } });
  remove.props.onPress(); assert.equal(deleted.length, 0);
  await dialogs[0].actions.find(a => a.variant === 'destructive').onPress(); assert.deepEqual(deleted, [{ conversationId: 'chat' }]);
  active = false; render(); assert.equal(skips.at(-1), true);
  h.unmount();
});
