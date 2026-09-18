const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { View: 'View', Text: 'Text', TouchableOpacity: 'Button', Image: 'Image',
  StyleSheet: { create: value => value }, Platform: { OS: 'ios', select: value => value.ios } };
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
}

for (const platform of ['ios', 'android']) {
  test(`${platform}: obsolete sheet layouts cannot update state after collapse, rotation, blur, refocus or unmount`, () => {
    const hooks = hookHarness();
    let changes = 0;
    const react = { ...hooks.react, useState: initial => {
      const [value, set] = hooks.react.useState(initial);
      return [value, next => set(previous => {
        const updated = typeof next === 'function' ? next(previous) : next;
        if (updated?.height && updated !== previous) changes++;
        return updated;
      })];
    } };
    const { useHomeSheet } = loader({ react, 'react-native': { ...native, Platform: { OS: platform } } })('hooks/home/useHomeSheet.ts');
    const props = { isDriver: true, width: 390, height: 844, currentUser: {}, insets: { bottom: 34 }, isScreenActive: true,
      latestTrips: [], availableDriverRequests: [], visibleDriverPassengerMarkers: [], router: { push() {} } };
    const draw = () => hooks.render(() => useHomeSheet(props));
    const layout = height => ({ nativeEvent: { layout: { height } } });
    draw().toggleTripsSheet();
    let state = draw();
    for (let cycle = 0; cycle < 100; cycle++) {
      const old = state.onSheetLayout;
      old(layout(250)); state = draw();
      state.toggleTripsSheet(); state = draw();
      const collapsed = state.onSheetLayout;
      const beforeCollapse = changes;
      old(layout(800)); assert.equal(changes, beforeCollapse);
      state.toggleTripsSheet(); state = draw();
      collapsed(layout(68)); assert.equal(changes, beforeCollapse);
      const beforeRotation = state.onSheetLayout;
      props.width = props.width === 390 ? 320 : 390; state = draw();
      const before = changes;
      beforeRotation(layout(780)); assert.equal(changes, before);
      const beforeBlur = state.onSheetLayout;
      props.isScreenActive = false; state = draw();
      beforeBlur(layout(770)); assert.equal(changes, before);
      // Current hidden layouts remain useful: cached data can change the height
      // in background without another native layout event on returning to Home.
      const hidden = state.onSheetLayout;
      hidden(layout(260)); state = draw();
      const beforeReturn = changes, hiddenBottom = state.locationButtonBottom;
      props.isScreenActive = true; state = draw();
      assert.equal(state.locationButtonBottom, hiddenBottom);
      beforeBlur(layout(750)); hidden(layout(745)); assert.equal(changes, beforeReturn);
      state.onSheetLayout(layout(240)); state = draw();
    }
    const beforeUnmount = changes, late = state.onSheetLayout;
    hooks.unmount(); late(layout(700));
    assert.equal(changes, beforeUnmount);
  });

  test(`${platform}: the loading animation has one native loop, pauses in background, and releases on unmount`, () => {
    const hooks = hookHarness();
    let running = 0, starts = 0, stops = 0, values = 0, interpolations = 0;
    const configs = [];
    const { HomeSheetLoadingState } = loader({ react: hooks.react, '@expo/vector-icons': { Ionicons: 'Icon' },
      'react-native': { ...native, Platform: { OS: platform, select: value => value[platform] }, Easing: { linear: 'linear' },
        Animated: { View: 'AnimatedView', Value: class {
          constructor() { values++; }
          interpolate() { interpolations++; return 0; }
        },
          timing: (_value, config) => { configs.push(config); return {}; },
          loop: () => { let active = false; return {
            start: () => { assert.equal(active, false); active = true; starts++; running++; },
            stop: () => { if (active) { active = false; stops++; running--; } },
          }; },
        },
      },
    })('components/home/HomeSheetLoadingState.tsx');
    const draw = active => hooks.render(() => HomeSheetLoadingState({ active }));
    draw(false); assert.equal(starts, 0);
    for (let cycle = 0; cycle < 100; cycle++) {
      draw(true); assert.equal(running, 1);
      const started = starts;
      for (let repeat = 0; repeat < 20; repeat++) draw(true);
      assert.equal(starts, started);
      draw(false); assert.equal(running, 0);
    }
    draw(true); hooks.unmount(); assert.equal(running, 0); assert.equal(starts, stops);
    assert.equal(values, 1); assert.equal(interpolations, 1);
    configs.forEach(config => { assert.equal(config.useNativeDriver, true); assert.equal(config.isInteraction, false); });
  });
}

test('HomeMap is shallow-memoized without a custom comparator that could suppress GPS or marker updates', () => {
  const { HomeMap } = loader({ 'react-native': native,
    'react-native-maps': { __esModule: true, default: 'MapView', Marker: 'Marker', Callout: 'Callout' },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/components/TrackingMapMarkers': { PassengerTrackingMarker: 'Passenger', VehicleTrackingMarker: 'Vehicle' },
    '@/features/home/homeMapAssets': { getTripMarkerImage() {}, getTripRequestMarkerImage() {} },
    '@/hooks/home/useHomeMarkerReadiness': { useHomeMarkerReadiness: () => () => {} },
    './HomeMapMarkers': { TripVehicleMapMarker: 'TripVehicle', UserLocationMapMarker: 'UserMarker' },
  })('components/home/HomeMap.tsx');
  assert.equal(HomeMap.$$typeof, Symbol.for('react.memo'));
  assert.equal(HomeMap.compare, null);
  const trip = { id: 'ongoing', departure: { lat: -4.325, lng: 15.3222 } };
  const props = { shouldRenderHomeMap: true, ongoingDriverTrip: trip, tripsWithMapCoordinates: [trip],
    tripRequestsWithMapCoordinates: [], visibleDriverPassengerMarkers: [], loadedTripMarkerKeys: new Set(),
    tripMarkerRefs: { current: {} }, passengerMarkerRefs: { current: {} }, liveUserCoordinate: { latitude: -4.325, longitude: 15.3222 } };
  let rendered = nodes(HomeMap.type(props));
  assert.equal(rendered.filter(node => node.type === 'MapView').length, 1);
  assert.deepEqual(rendered.find(node => node.type === 'Marker').props.coordinate, props.liveUserCoordinate);
  const moved = { latitude: -4.33, longitude: 15.32 };
  rendered = nodes(HomeMap.type({ ...props, liveUserCoordinate: moved }));
  assert.deepEqual(rendered.find(node => node.type === 'Marker').props.coordinate, moved);
  assert.equal(nodes(HomeMap.type({ ...props, shouldRenderHomeMap: false })).some(node => node.type === 'MapView'), false);
});

test('reservation list callbacks remain stable during refreshes and still use the latest actions and tab', () => {
  const hooks = hookHarness();
  const load = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    '@/features/bookings/BookingListCard': { BookingListCard: 'BookingListCard' } });
  const { useBookingCards } = load('hooks/bookings/useBookingCards.tsx');
  const calls = [], noop = () => {};
  const params = { activeTab: 'active', router: {}, isCancelling: false,
    setSelectedDriverPhone: noop, setSelectedDriverName: noop, setContactModalVisible: noop, handleCancel: id => calls.push(id) };
  const draw = () => hooks.render(() => useBookingCards({ ...params }));
  const initial = draw();
  for (let i = 0; i < 1000; i++) {
    const next = draw();
    assert.equal(next.renderBookingListItem, initial.renderBookingListItem);
    assert.equal(next.renderBookingCard, initial.renderBookingCard);
  }
  const booking = { id: 'booking' };
  assert.equal(draw().renderBookingListItem({ item: booking }).props.booking, booking);
  params.isCancelling = true;
  assert.equal(draw().renderBookingListItem({ item: booking }).props.isCancelling, true);
  params.activeTab = 'history'; params.handleCancel = id => calls.push(`new:${id}`);
  const updated = draw().renderBookingListItem({ item: booking });
  assert.equal(updated.props.activeTab, 'history');
  updated.props.handleCancel('booking'); assert.deepEqual(calls, ['new:booking']);
  hooks.unmount();
});

test('booking feed refresh keeps its identity while query result wrappers change and updates on tab changes', () => {
  const hooks = hookHarness(), calls = [], data = [];
  const activity = { data, refetch: () => calls.push('activity') };
  const history = { refetch: () => calls.push('history') };
  const { useBookingsFeed } = loader({ react: hooks.react,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/api/bookingApi': { useGetMyActivityBookingsQuery: () => ({ ...activity }),
      useGetMyBookingHistoryInfiniteQuery: () => ({ ...history }) },
  })('hooks/bookings/useBookingsFeed.ts');
  const draw = tab => hooks.render(() => useBookingsFeed(tab));
  const initial = draw('active');
  for (let i = 0; i < 1000; i++) assert.equal(draw('active').refetch, initial.refetch);
  draw('active').refetch(); draw('history').refetch();
  history.isUninitialized = true; draw('history').refetch();
  assert.deepEqual(calls, ['activity', 'history']);
  hooks.unmount();
});
