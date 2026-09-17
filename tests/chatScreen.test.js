const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = {
  Text: 'Text', View: 'View', TouchableOpacity: 'Button', TextInput: 'Input', FlatList: 'List',
  RefreshControl: 'Refresh', ActivityIndicator: 'Loading', KeyboardAvoidingView: 'KeyboardAvoidingView',
  StyleSheet: { create: value => value }, Platform: { OS: 'ios' },
  Keyboard: { dismiss() {}, isVisible: () => false, addListener: () => ({ remove() {} }) },
  BackHandler: { addEventListener: () => ({ remove() {} }) },
};
const msg = (id, time, senderId = 'me') => ({ id, createdAt: time, senderId, content: `Message ${id}` });
function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (!React.isValidElement(element)) return [];
  return [element, ...nodes(element.props.children)];
}

test('message list preserves chronological grouping, deduplication and own-message actions', () => {
  const hooks = hookHarness(), actions = [];
  const load = loader({ react: { ...hooks.react, memo: React.memo }, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' } });
  const { ChatMessageList } = load('components/chat/ChatMessageList.tsx');
  const a = msg('a', '2026-09-16T10:00:00Z'), b = msg('b', '2026-09-17T11:00:00Z', 'other');
  const props = { messages: [b, a, { ...a }], userId: 'me', loading: false, refreshing: false,
    onRefresh() {}, onMessageActions: message => actions.push(message) };
  const render = () => hooks.render(() => ChatMessageList.type(props));
  const first = render();
  assert.equal(first.type, 'List');
  assert.equal(first.props.inverted, true);
  assert.equal(first.props.removeClippedSubviews, false);
  assert.equal(first.props.windowSize, 7);
  assert.deepEqual(first.props.data.map(row => row.kind), ['message', 'date', 'message', 'date']);
  assert.deepEqual(first.props.data.filter(row => row.kind === 'message').map(row => row.id), ['b', 'a']);
  for (const item of first.props.data) {
    nodes(first.props.renderItem({ item })).filter(node => node.type === 'Button').forEach(node => node.props.onLongPress());
  }
  assert.deepEqual(actions.map(message => message.id), ['a']);
  const second = render();
  assert.equal(second.props.data, first.props.data);
  assert.equal(second.props.renderItem, first.props.renderItem);
  assert.equal(second.props.maintainVisibleContentPosition, first.props.maintainVisibleContentPosition);
  hooks.unmount();
});

function screenFixture() {
  const hooks = hookHarness(), queryCalls = [], socketCalls = [];
  let active = true;
  const router = { canGoBack: () => true, back() {}, replace() {} };
  const dispatch = () => {};
  const read = () => ({ unwrap: async () => ({}) });
  const messages = [msg('a', '2026-09-17T10:00:00Z')];
  const conversation = { id: 'chat', bookingId: 'booking', participants: [] };
  const refetch = async () => {};
  const showDialog = () => {};
  const load = loader({ react: { ...hooks.react, memo: React.memo }, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { useRouter: () => router, useLocalSearchParams: () => ({ id: 'chat' }) },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea', useSafeAreaInsets: () => ({ bottom: 34 }) },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog }) },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: () => ({ id: 'me' }) },
    '@/store/selectors': { selectUser() {} },
    '@/services/analytics': { trackEvent() {} }, '@/utils/phoneHelpers': { openWhatsApp() {} },
    '@/services/chatSocket': { chatSocket: {
      subscribeToMessages: () => { socketCalls.push('subscribe'); return () => socketCalls.push('unsubscribe'); },
      joinBookingRoom: async () => {}, leaveBookingRoom: async () => {},
    } },
    '@/store/api/messageApi': {
      useGetConversationQuery: (_args, options) => { queryCalls.push(options); return { data: conversation, refetch }; },
      useGetConversationMessagesQuery: (_args, options) => { queryCalls.push(options); return { data: messages, refetch }; },
      useSendConversationMessageMutation: () => [read, { isLoading: false }],
      useEditConversationMessageMutation: () => [read], useDeleteConversationMessageMutation: () => [read],
      useMarkConversationAsReadMutation: () => [read],
    },
  });
  const { default: ChatScreen } = load('app/chat/[id].tsx');
  const { ChatMessageList } = load('components/chat/ChatMessageList.tsx');
  return { hooks, queryCalls, socketCalls, ChatMessageList, setActive: value => { active = value; },
    render: () => nodes(hooks.render(ChatScreen)) };
}

test('typing a draft leaves memoized list props stable; back detaches it and stops reads/socket', () => {
  const app = screenFixture();
  const first = app.render().find(node => node.type === app.ChatMessageList);
  const textInput = app.render().find(node => node.type === 'Input');
  textInput.props.onChangeText('Bonjour');
  const secondNodes = app.render(), second = secondNodes.find(node => node.type === app.ChatMessageList);
  for (const key of Object.keys(first.props)) assert.equal(second.props[key], first.props[key], key);
  secondNodes.find(node => node.props.accessibilityLabel === 'Retour aux conversations').props.onPress();
  const leaving = app.render();
  assert.equal(leaving.some(node => node.type === app.ChatMessageList), false);
  assert.equal(leaving.find(node => node.type === 'KeyboardAvoidingView').props.enabled, false);
  assert.equal(leaving.find(node => node.type === 'Input').props.editable, false);
  assert.ok(app.queryCalls.slice(-2).every(options => options.skip));
  assert.deepEqual(app.socketCalls, ['subscribe', 'unsubscribe']);
  app.hooks.unmount();
});

test('moving chat to background stops its work and resumes a single subscription on foreground', () => {
  const app = screenFixture(); app.render();
  app.setActive(false);
  assert.equal(app.render().some(node => node.type === app.ChatMessageList), false);
  assert.ok(app.queryCalls.slice(-2).every(options => options.skip));
  app.setActive(true); app.render();
  assert.deepEqual(app.socketCalls, ['subscribe', 'unsubscribe', 'subscribe']);
  app.hooks.unmount();
  assert.deepEqual(app.socketCalls, ['subscribe', 'unsubscribe', 'subscribe', 'unsubscribe']);
});
