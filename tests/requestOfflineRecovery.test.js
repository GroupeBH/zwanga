const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { getAssignedDriverTripId, getAssignedPassengerTripId } = loader()('features/trip-request/assignedTripNavigation.ts');
const request = { id: 'request', passengerId: 'passenger', selectedDriverId: 'driver', tripId: 'trip', status: 'driver_selected' };

test('cached driver link is scoped to the confirmed assignment, route, account and transient errors', () => {
  for (const status of ['FETCH_ERROR', 'TIMEOUT_ERROR', 408, 429, 500, 503])
    assert.equal(getAssignedDriverTripId('request', request, 'driver', { status }), 'trip');
  for (const status of [401, 403, 404, 410, 400, 'PARSING_ERROR'])
    assert.equal(getAssignedDriverTripId('request', request, 'driver', { status }), null);
  assert.equal(getAssignedDriverTripId('other', request, 'driver'), null);
  assert.equal(getAssignedDriverTripId('request', request, 'other'), null);
  assert.equal(getAssignedDriverTripId('request', request, undefined), null);
  assert.equal(getAssignedDriverTripId('request', { ...request, status: 'cancelled' }, 'driver'), null);
  assert.equal(getAssignedDriverTripId('request', { ...request, tripId: null }, 'driver'), null);
});

test('request error screen keeps a guarded working trip link for both parties, with no extra acceptance action', () => {
  const model = { tripRequest: request, isScreenActive: true, isError: true, isLoading: false,
    isFetchingRequest: false, canOpenAssignedTrip: true, goHome() {}, refetch() {} };
  const calls = [], ready = [];
  model.handleViewTrip = id => calls.push(id);
  const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', Pressable: 'Button', ActivityIndicator: 'Spinner',
    ScrollView: 'Scroll', RefreshControl: 'Refresh', StyleSheet: { create: x => x }, useWindowDimensions: () => ({ width: 390, height: 844 }) };
  const mocks = { react: React, 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { SafeAreaView: 'SafeArea' },
    '@/hooks/useMainScreenReady': { useMainScreenReady: enabled => () => ready.push(enabled) },
    '@/features/request-detail/SharedTripPanel': { SharedTripPanel: 'Shared' },
    '@/features/request-detail/RequestSearchScreen': { RequestSearchScreen: 'Search' },
    '@/store/api/sharedTripApi': { useSharedTripContextQuery: () => ({}) },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: () => true, displayReadOptions: () => ({}) },
    '@/services/rideAlertSession': { acknowledgeRideAlerts() {} },
    '../../hooks/request-detail/useRequestDetailController': { useRequestDetailController: () => model },
    '../../features/request-detail/requestPresentation': { buildRequestDetailPresentation: () => ({}) },
    '../../features/request-detail/RequestDriverSummary': { RequestDriverSummary: 'Summary' },
    '@/features/request-detail/RequestPassengerTicket': { RequestPassengerTicket: 'Ticket', RequestPassengerActions: 'PassengerActions' },
    '@/features/request-detail/RequestDriverCourse': { RequestDriverCourse: 'Course', RequestCourseActions: 'CourseActions' },
    '@/features/request-detail/RequestDriverDecision': { RequestDriverDecision: 'Decision', RequestDecisionActions: 'DecisionActions' },
    '../../features/request-detail/RequestEditModal': { RequestEditModal: 'Edit' },
    '../../features/request-detail/RequestAcceptModal': { RequestAcceptModal: 'Accept' },
    '../../features/screen-styles/app/request/detail/index': { styles: {} },
    '@/components/LocationPickerModal': { __esModule: true, default: 'Picker' },
  };
  const screen = loader(mocks)('app/request/[id].tsx').default;
  const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
    ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
  const words = tree => typeof tree === 'string' ? tree : Array.isArray(tree)
    ? tree.map(words).join(' ') : words(tree?.props?.children ?? '');
  for (const role of ['driver', 'passenger']) for (const status of ['FETCH_ERROR', 503, 403, 404]) {
    Object.assign(model, { userId: role, isOwner: role === 'passenger', isDriverAccount: role === 'driver', error: { status } });
    model.driverTripId = getAssignedDriverTripId('request', request, role, model.error);
    model.passengerTripId = getAssignedPassengerTripId('request', request, role, model.error);
    const tree = screen(), link = nodes(tree).find(n => n.type === 'Button' && words(n).includes('Voir mon trajet'));
    assert.equal(Boolean(link), status === 'FETCH_ERROR' || status === 503);
    if (link) { link.props.onPress(); tree.props.onLayout(); assert.equal(ready.at(-1), true); }
    assert.doesNotMatch(words(tree), /Accepter/);
  }
  assert.deepEqual(calls, ['trip', 'trip', 'trip', 'trip']);
});
