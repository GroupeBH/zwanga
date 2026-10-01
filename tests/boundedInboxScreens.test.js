const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function elements(tree) {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  return React.isValidElement(tree) ? [tree, ...elements(tree.props.children)] : [];
}
function screen(t, kind) {
  const hooks = hookHarness(), calls = [], dialogs = [];
  const query = { hasNextPage: true, hasPreviousPage: true, isError: false, isFetching: false,
    data: { pages: [{ data: [], notifications: [{ id: 'synthetic', isRead: false }], unreadCount: 1 }] },
    fetchNextPage: () => calls.push('next'), fetchPreviousPage: () => calls.push('previous'), refetch: () => calls.push('refresh') };
  const env = { active: true, query };
  const mutation = () => ({ unwrap: async () => {} });
  const dispatch = () => {};
  const Screen = loader({
    react: { ...React, ...hooks.react },
    'react-native': { StyleSheet: { create: x => x }, Platform: { OS: 'android' }, Keyboard: { dismiss() {} },
      View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'TouchableOpacity',
      ActivityIndicator: 'ActivityIndicator', FlatList: 'FlatList', RefreshControl: 'RefreshControl', Modal: 'Modal' },
    'expo-router': { useRouter: () => ({ back() {}, push() {} }) },
    '@expo/vector-icons': { Ionicons: 'Ionicons' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeAreaView' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => env.active },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: dialog => dialogs.push(dialog) }) },
    '@/store/api/userApi': { useGetCurrentUserQuery: () => ({ data: {} }) },
    '@/store/hooks': { useAppDispatch: () => dispatch, useAppSelector: selector => selector() },
    '@/store/selectors': { selectUser: () => ({ id: 'me' }), selectConversations: () => [] },
    '@/store/api/messageApi': { useListConversationPagesInfiniteQuery: () => query, useDeleteConversationMutation: () => [mutation] },
    '@/store/api/notificationApi': { useGetNotificationPagesInfiniteQuery: () => query,
      useDisableNotificationsMutation: () => [mutation], useMarkNotificationsAsReadMutation: () => [mutation],
      useMarkAllNotificationsAsReadMutation: () => [mutation] },
  })(kind === 'messages' ? 'app/(tabs)/messages.tsx' : 'app/notifications.tsx').default;
  const render = () => hooks.render(() => Screen());
  const list = () => elements(render()).find(e => e.type === 'FlatList').props;
  const controls = () => {
    const props = list();
    return { previous: props.ListHeaderComponent.props,
      next: (typeof props.ListFooterComponent === 'function' ? props.ListFooterComponent() : props.ListFooterComponent).props };
  };
  t.after(() => hooks.unmount());
  return { env, query, calls, dialogs, render, list, controls };
}

for (const kind of ['messages', 'notifications']) {
  test(`${kind}: both directions remain accessible after eviction and automatic paging does not cascade`, t => {
    const f = screen(t, kind);
    f.list().onEndReached(); assert.deepEqual(f.calls, []);
    const controls = f.controls();
    assert.equal(controls.previous.hasMore, true); assert.equal(controls.next.hasMore, true);
    controls.previous.onLoad(); controls.next.onLoad(); assert.deepEqual(f.calls, ['previous', 'next']);
    f.query.hasPreviousPage = false; f.list().onEndReached(); assert.equal(f.calls.at(-1), 'next');
    f.query.hasNextPage = false; f.calls.length = 0;
    f.list().onEndReached(); assert.deepEqual(f.calls, []);
  });

  test(`${kind}: a failed revalidation is retried before fetching another offset`, t => {
    const f = screen(t, kind); f.query.isError = true;
    const controls = f.controls(); assert.equal(controls.previous.error, true);
    f.list().onEndReached(); assert.deepEqual(f.calls, []);
    controls.next.onLoad(); controls.previous.onLoad(); assert.deepEqual(f.calls, ['refresh', 'refresh']);
    f.query.isError = false; f.controls().next.onLoad(); assert.equal(f.calls.at(-1), 'next');
  });

  test(`${kind}: inactive and busy screens cannot start either paging direction or refresh`, t => {
    const f = screen(t, kind);
    for (const [active, busy] of [[false, false], [true, true]]) {
      f.env.active = active; f.query.isFetching = busy;
      const { previous, next } = f.controls();
      assert.equal(previous.disabled, true); assert.equal(next.disabled, true);
      previous.onLoad(); next.onLoad(); f.list().onEndReached();
      const props = f.list(); (props.onRefresh ?? props.refreshControl.props.onRefresh)();
    }
    assert.deepEqual(f.calls, []);
  });
}

test('at the oldest notification page, delete-all still explicitly means only displayed notifications', t => {
  const f = screen(t, 'notifications'); f.query.hasNextPage = false;
  const button = elements(f.render()).find(e => e.type === 'TouchableOpacity' &&
    elements(e.props.children).some(child => child.props.name === 'trash-outline'));
  button.props.onPress(); assert.match(f.dialogs[0].title, /affichées/);
  assert.match(f.dialogs[0].message, /autres pages/);
});

test('an empty old notification anchor still renders the more-recent control', t => {
  const f = screen(t, 'notifications'); f.query.data.pages[0].notifications = [];
  f.query.hasNextPage = false;
  assert.equal(f.list().data.length, 0); assert.equal(f.controls().previous.hasMore, true);
  f.controls().previous.onLoad(); assert.deepEqual(f.calls, ['previous']);
});
