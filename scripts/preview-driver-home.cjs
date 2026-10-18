/* global __dirname */
// Real Home components via RN Web, synthetic data only; no API, GPS or map SDK.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement, noop = () => {};
const icons = { 'search-outline': '⌕', 'chevron-forward': '›', add: '+', 'notifications-outline': '♧' };
const load = loader({
  'react-native': native,
  '@expo/vector-icons': { Ionicons: ({ name, size, color }) => h('span', { style: { color, fontSize: size } }, icons[name] ?? '•') },
  'expo-router': { useRouter: () => ({ push: noop }) },
  '@/store/hooks': { useAppSelector: select => select({ zwangaApi: { config: { online: true } } }) },
  '@/store/api/driverDispatchApi': { useDriverDispatchStatusQuery: () => ({ data: { enabled: true, available: true,
    presence: { expiresAt: new Date(Date.now() + 60_000).toISOString() } } }) },
  '@/store/api/driverSettlementsApi': { useGetMyDriverSettlementQuery: () => ({ data: { availableBalance: 12000, currency: 'CDF' } }) },
  '@/store/api/userApi': { useGetFavoriteLocationsQuery: () => ({ data: [] }) },
  './SwipeableHomePriority': { SwipeableHomePriority: ({ children }) => children },
});
const { HomeHeader } = load('components/home/HomeHeader.tsx');
const { HomeTripsSheet } = load('components/home/HomeTripsSheet.tsx');
const request = { id: 'sample', passengerId: 'example', passengerName: 'Passager exemple',
  departure: { name: 'Rond-point Ngaba' }, arrival: { name: 'Grand Marché de Kinshasa' },
  departureDateMin: new Date(Date.now() + 3600_000).toISOString(),
  departureDateMax: new Date(Date.now() + 7200_000).toISOString(),
  status: 'pending', numberOfSeats: 1, maxPricePerSeat: 2500, offers: [], vehicleType: 'car' };
const previews = [320, 390].map(width => h(native.View, { key: width, style: { width } },
  h(native.Text, { style: { paddingBottom: 12 } }, `Conducteur · ${width} px`),
  h(native.View, { style: { height: 760, backgroundColor: '#E8EEE8', overflow: 'hidden' } },
    h(native.Text, { style: { position: 'absolute', top: 150, alignSelf: 'center', color: '#57635C' } }, 'Carte · aperçu sans GPS'),
    h(HomeHeader, { insets: { top: 20 }, firstName: 'Alex', unreadNotifications: 2, router: { push: noop } }),
    h(HomeTripsSheet, { firstName: 'Alex', isDriver: true, isScreenActive: true,
      sheetBottomOffset: 0, sheetHeight: 760 * 0.63, effectiveTripsSheetOpen: true,
      sheetTitle: 'Clients', toggleTripsSheet: noop, openSheetIndex: noop,
      availableDriverRequests: [request], latestTrips: [], bookedTripIds: new Set(),
      hiddenHomePriorities: {}, recentDestinations: [], prioritiesEnabled: false,
      router: { push: noop }, openTripRequestDetail: noop, openTripDetail: noop, refetchSheetContent: noop }),
  )));
const markup = renderToStaticMarkup(h(native.View, { style: { padding: 18, flexDirection: 'row', gap: 18 } }, previews));
const directory = path.resolve(__dirname, '../.expo/driver-home-preview');
fs.mkdirSync(directory, { recursive: true });
const target = path.join(directory, 'index.html');
fs.writeFileSync(target, `<!doctype html><html lang="fr"><meta charset="utf-8"><title>Accueil conducteur</title>
<style>${native.StyleSheet.getSheet().textContent}body{margin:0;background:#F3F4F6;font-family:Arial,sans-serif}</style>${markup}</html>`);
console.log(target);
