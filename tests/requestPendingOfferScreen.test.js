const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const nodes = tree => Array.isArray(tree) ? tree.flatMap(nodes) : React.isValidElement(tree)
  ? [tree, ...nodes(tree.props.children)] : [];
const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree)
  ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');

test('request screen keeps withdrawal outside sharing and acceptance gates', () => {
  const pending = { id: 'offer', driverId: 'driver', status: 'pending' };
  const model = { userId: 'driver', isDriverAccount: true, isScreenActive: true, isIdentityVerified: false,
    canAcceptDirectly: false, compatibleActiveVehicles: [], myOffer: pending,
    tripRequest: { id: 'request', passengerId: 'passenger', status: 'offers_received', offers: [pending],
      departureDateMin: '2099-01-01T10:00:00Z', departureDateMax: '2099-01-01T11:00:00Z' } };
  const state = { sharing: false };
  const screen = loader({ react: React,
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner',
      ScrollView: 'Scroll', RefreshControl: 'Refresh', StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/hooks/useMainScreenReady': { useMainScreenReady: () => () => {} },
    '@/features/request-detail/SharedTripPanel': { SharedTripPanel: 'Shared' },
    '@/features/request-detail/RequestSearchScreen': { RequestSearchScreen: 'Search' },
    '@/store/api/sharedTripApi': { useSharedTripContextQuery: () => ({ currentData: { hasOngoingTrip: state.sharing } }) },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => true, displayReadOptions: () => ({}) },
    '@/services/rideAlertSession': { acknowledgeRideAlerts() {} },
    '../../hooks/request-detail/useRequestDetailController': { useRequestDetailController: () => model },
    '../../features/request-detail/requestPresentation': { buildRequestDetailPresentation: () => ({}) },
    '../../features/request-detail/RequestDriverSummary': { RequestDriverSummary: 'Summary' },
    '@/features/request-detail/RequestPassengerTicket': { RequestPassengerTicket: 'Ticket', RequestPassengerActions: 'PassengerActions' },
    '@/features/request-detail/RequestDriverCourse': { RequestDriverCourse: 'Course', RequestCourseActions: 'CourseActions' },
    '@/features/request-detail/RequestDriverDecision': { RequestDriverDecision: 'Decision', RequestDecisionActions: 'DecisionActions' },
    '@/features/request-detail/RequestPendingOfferActions': { RequestPendingOfferActions: 'Withdrawal' },
    '../../features/request-detail/RequestEditModal': { RequestEditModal: 'Edit' },
    '../../features/request-detail/RequestAcceptModal': { RequestAcceptModal: 'Accept' },
    '../../features/screen-styles/app/request/detail/index': { styles: {} },
    '@/components/LocationPickerModal': { __esModule: true, default: 'Picker' },
  })('app/request/[id].tsx').default;
  for (const sharing of [true, false]) {
    state.sharing = sharing;
    const tree = screen(), elements = nodes(tree);
    assert.match(words(tree), /Commande en attente/);
    assert.equal(elements.filter(n => n.type === 'Withdrawal').length, 1);
    assert.equal(elements.some(n => n.type === 'DecisionActions'), false);
    assert.equal(nodes(elements.find(n => n.type === 'Scroll')).some(n => n.type === 'Withdrawal'), false);
  }
  model.tripRequest.offers = []; model.myOffer = undefined; state.sharing = false;
  assert.equal(nodes(screen()).some(n => n.type === 'DecisionActions'), true, 'normal acceptance is preserved');
});
