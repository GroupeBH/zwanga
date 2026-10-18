const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('referrals use small server pages, pause covered reads, keep pagination and ignore a late refresh after blur', async () => {
  const hooks = hookHarness(), calls = [], refreshes = [];
  let active = true, userId = 'first';
  const query = name => (args, options) => {
    calls.push({ name, args, options });
    return { data: name === 'summary' ? { referralCount: 1000 } : undefined,
      currentData: { data: [], nextCursor: 'next' }, isFetching: false,
      refetch: () => { refreshes.push(name); return Promise.resolve(); } };
  };
  const { useReferralScreenData } = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => active },
    '@/store/hooks': { useAppSelector: fn => fn({ auth: { user: userId ? { id: userId } : null } }) },
    '@/store/api/referralApi': { useGetMyReferralSummaryQuery: query('summary'),
      useGetMyReferralPageQuery: query('people'), useGetMyReferralRewardPageQuery: query('rewards'),
      useGetMyReferralWithdrawalPageQuery: query('withdrawals') },
  })('hooks/referrals/useReferralScreenData.ts');
  const render = () => hooks.render(useReferralScreenData);
  let view = render();
  assert.deepEqual(calls.slice(1).map(call => call.args.limit), [20, 8, 5]);
  assert.equal(view.summary.referralCount, 1000);
  view.peopleCursor.next('next'); view = render();
  assert.equal(view.peopleCursor.page, 2);
  assert.equal(calls.filter(call => call.name === 'people').at(-1).args.before, 'next');
  const lateRefresh = view.refreshAll;
  active = false; calls.length = 0; render();
  assert.ok(calls.every(call => call.options.skip && !call.options.refetchOnFocus && call.options.pollingInterval === 0));
  await lateRefresh(); assert.deepEqual(refreshes, []);
  active = true; view = render(); await view.refreshAll(); assert.equal(refreshes.length, 4);
  const previousAccountRefresh = view.refreshAll;
  userId = 'second'; view = render(); assert.equal(view.peopleCursor.page, 1);
  await previousAccountRefresh(); assert.equal(refreshes.length, 4);
  userId = null; calls.length = 0; render(); assert.ok(calls.every(call => call.options.skip));
  hooks.unmount();
});

test('referral screen virtualizes the page while preserving QR, withdrawal input and all three pagination controls', () => {
  const React = require('react'), hooks = hookHarness();
  const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes)
    : React.isValidElement(tree) ? [tree, ...nodes(tree.props.children)] : [];
  const people = Array.from({ length: 20 }, (_, i) => ({ userId: `synthetic-${i}` }));
  const summary = { referralCount: 1000, rewardCount: 500, balances: {}, withdrawal: {}, rules: {} };
  const query = data => ({ currentData: { data, nextCursor: 'next' }, isFetching: false, isError: false });
  const feed = { active: true, summary, peopleQuery: query(people), rewardsQuery: query([]), withdrawalsQuery: query([]),
    peopleCursor: {}, rewardsCursor: {}, withdrawalsCursor: {}, refreshAll() {}, refetchSummary() {} };
  const Screen = loader({ react: { ...React, ...hooks.react },
    'react-native': { StyleSheet: { create: x => x }, Platform: { OS: 'android' },
      ActivityIndicator: 'Spinner', RefreshControl: 'Refresh', FlatList: 'List', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button', View: 'View' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' }, '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { useRouter: () => ({ back() {}, push() {} }) },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog() {} }) },
    '@/hooks/referrals/useReferralScreenData': { useReferralScreenData: () => feed },
    '../hooks/referrals/useReferralActions': { useReferralActions: () => ({ handleShare() {}, handleWithdrawal() {} }) },
    '@/store/api/referralApi': { useRequestReferralWithdrawalMutation: () => [() => {}, { isLoading: false }] },
    '@/features/referrals/ReferralQrAction': { ReferralQrAction: 'QRAction' },
    '@/features/referrals/ReferralPageControls': { ReferralPageControls: 'PageControls' },
    '@/features/referrals/ReferralPersonRow': { ReferralPersonRow: 'PersonRow' },
  })('app/referrals.tsx').default;
  const renderList = () => nodes(hooks.render(Screen)).find(node => node.type === 'List');
  let list = renderList();
  assert.equal(list.props.data, people);
  assert.equal(list.props.initialNumToRender, 8);
  assert.equal(list.props.maxToRenderPerBatch, 8);
  assert.ok(list.props.ListHeaderComponent.props.style.gap > 0);
  assert.ok(list.props.ListFooterComponent.props.style.gap > 0);
  assert.equal(list.props.keyExtractor(people[3]), 'synthetic-3');
  assert.equal(list.props.renderItem({ item: people[0] }).props.referral, people[0]);
  assert.equal(nodes(list.props.ListHeaderComponent).find(node => node.type === 'QRAction').props.summary, summary);
  assert.equal(nodes(list.props.ListFooterComponent).filter(node => node.type === 'PageControls').length, 3);
  const footerType = list.props.ListFooterComponent.type;
  nodes(list.props.ListFooterComponent).find(node => node.type === 'Input').props.onChangeText('12');
  list = renderList();
  assert.equal(list.props.ListFooterComponent.type, footerType);
  assert.equal(nodes(list.props.ListFooterComponent).find(node => node.type === 'Input').props.value, '12');
  hooks.unmount();
});
