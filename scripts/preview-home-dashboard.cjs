/* global __dirname */
// Actual Home UI, mocked data/map only. No API, session or account changes.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement;
const noop = () => {};
const departureTime = new Date(Date.now() + 3600000).toISOString();
const trip = { id: 'example-trip', departure: { name: 'Rond-point Ngaba' },
  arrival: { name: 'Grand Marché de Kinshasa' }, departureTime, price: 2000, availableSeats: 4,
  driverName: 'Conducteur de test', driverRating: 4.8, vehicleType: 'car' };
const request = { id: 'example-request', departure: trip.departure, arrival: trip.arrival,
  departureDateMin: departureTime, departureDateMax: departureTime,
  numberOfSeats: 1, maxPricePerSeat: 2000, passengerName: 'Passager de test', vehicleType: 'car' };
const icons = { add: '+', search: '⌕', 'notifications-outline': '♧', locate: '⊙', ellipse: '●',
  'home-outline': '⌂', 'briefcase-outline': '▣', 'car-outline': '▱', 'chatbubble-outline': '▢', 'person-outline': '♙' };
const Icon = ({ name, color, size }) => h('span', { style: { color, fontSize: size } }, icons[name] || '›');
// Real tab options/styles, with only the navigator and glyph font simulated.
function tabBar(isDriver) {
  const Tabs = ({ children, screenOptions: options }) => h(native.View,
    { style: [options.tabBarStyle, { flexDirection: 'row', flexShrink: 0, position: 'relative' }] },
    React.Children.toArray(children).filter(child => child.props.options.href !== null).map(child => {
      const focused = child.props.name === 'index';
      const color = focused ? options.tabBarActiveTintColor : options.tabBarInactiveTintColor;
      return h(native.View, { key: child.props.name, style: [options.tabBarItemStyle, { flex: 1, alignItems: 'center' }] },
        child.props.options.tabBarIcon({ focused, color, size: 24 }),
        h(native.Text, { style: [options.tabBarLabelStyle, { color }] }, child.props.options.title));
    }));
  Tabs.Screen = function PreviewTabScreen() { return null; };
  const { default: TabLayout } = loader({ 'react-native': native, 'expo-router': { Tabs },
    '@expo/vector-icons': { Ionicons: Icon },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '@/components/OngoingTripBanner': { OngoingTripBanner: () => null },
    '@/store/hooks': { useAppSelector: select => select({ auth: { user: { role: isDriver ? 'driver' : 'passenger' } } }) },
    '@/store/selectors': { selectUnreadMessagesCount: () => 2 },
  })('app/(tabs)/_layout.tsx');
  return h(TabLayout);
}
function frame(width, height, isDriver) {
  const home = { isDriver, firstName: isDriver ? 'Alex' : 'Camille', isOnline: true, currentUser: { id: 'example' },
    isScreenActive: true, insets: { top: 20, bottom: 0 }, width, height,
    router: { push: noop }, unreadNotifications: 2, availableDriverRequests: [request], latestTrips: [trip],
    isRequestsSheetMode: isDriver, setHomeSheetMode: noop, bookedTripIds: new Set(),
    sheetBottomOffset: 0, locationButtonBottom: 36, openSheetIndex: noop, openTripDetail: noop,
    openTripRequestDetail: noop, refetchSheetContent: noop, dismissPriority: noop };
  const { default: HomeScreen } = loader({
    'react-native': native,
    '@expo/vector-icons': { Ionicons: Icon },
    'react-native-safe-area-context': { SafeAreaView: ({ edges, ...props }) => h(native.View, props) },
    '@/hooks/home/useHomeController': { useHomeController: () => home },
    '@/hooks/home/useHomeFavoriteShortcut': { useHomeFavoriteShortcut: () => ({ pending: null, error: null, openFavorite: noop }) },
    '@/components/AppUpdatePrompt': { AppUpdatePrompt: () => null },
    './SwipeableHomePriority': { SwipeableHomePriority: ({ children }) => children },
    '@/components/home/HomeMap': { HomeMap: () => h(native.View, { style: { flex: 1, backgroundColor: '#ECEFE9', justifyContent: 'center', alignItems: 'center' } },
      h(native.View, { style: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#EAD7C9', alignItems: 'center', justifyContent: 'center' } },
        h(native.View, { style: { width: 20, height: 20, borderRadius: 10, borderColor: '#FFFFFF', borderWidth: 3, backgroundColor: '#BC4008' } }))) },
  })('app/(tabs)/index.tsx');
  return h(native.View, { style: { width, height, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDDDDD' } },
    h(HomeScreen), tabBar(isDriver));
}
const markup = renderToStaticMarkup(h(native.View, { style: { flexDirection: 'row', gap: 16, padding: 16 } },
  frame(390, 844, true), frame(390, 844, false), frame(320, 680, true), frame(320, 680, false)));
const directory = path.resolve(__dirname, '../.expo/home-dashboard-preview');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${native.StyleSheet.getSheet().textContent}body{margin:0;background:#DDDDDD;font-family:Arial,sans-serif}</style>${markup}</html>`);
console.log(path.join(directory, 'index.html'));
