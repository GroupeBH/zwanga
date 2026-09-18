/* global __dirname */
// Static visual check of the real Home components via React Native Web.
// Writes preview artifacts only under the ignored .expo directory; no API calls.
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const native = require('react-native-web');
const { loader } = require('../tests/helpers/loadTypeScript.cjs');
const h = React.createElement;
const previewMocks = {
  'react-native': native,
  '@expo/vector-icons': { Ionicons: ({ name, color, size }) => h('span', {
    style: { color, fontSize: size, flexShrink: 0 },
  }, name === 'arrow-forward' ? '→' : '›') },
  './SwipeableHomePriority': { SwipeableHomePriority: ({ children }) => children },
};
const load = loader(previewMocks);
const { HomeActivityCards } = load('components/home/HomeActivityCards.tsx');
const { TripPreviewCard } = load('components/home/TripPreviewCard.tsx');
const { TripRequestPreviewCard } = load('components/home/TripRequestPreviewCard.tsx');
const departureTime = new Date(); departureTime.setHours(11, 0, 0, 0);
const maxTime = new Date(departureTime); maxTime.setMinutes(30);
// Local image fixture to check photo cropping without fetching a person's image.
const previewPhoto = `data:image/png;base64,${fs.readFileSync(path.resolve(__dirname, '../assets/images/icon.png')).toString('base64')}`;
const trip = {
  id: 'preview-trip', departure: { name: 'Rond-point Ngaba' },
  arrival: { name: 'Grand Marché de Kinshasa' },
  departureTime: departureTime.toISOString(), price: 2000, availableSeats: 4,
  driverName: 'Alex', driverRating: 4.8, vehicleType: 'car',
  driverAvatar: previewPhoto,
};
const request = {
  id: 'preview-request', departure: { name: 'Avenue de la Démocratie' },
  arrival: { name: 'Université de Kinshasa' },
  departureDateMin: departureTime.toISOString(), departureDateMax: maxTime.toISOString(),
  numberOfSeats: 2, maxPricePerSeat: 2500, passengerName: 'Marie', status: 'pending', offers: [], vehicleType: 'motorcycle_2_wheels',
};
const noop = () => {};
const sectionTitle = text => h(native.Text, { style: { marginTop: 12, fontSize: 12, fontWeight: '700', color: '#6C757D' } }, text);
const phone = width => h(native.View, { style: { width, padding: 12, gap: 8, backgroundColor: '#F1F3F5', borderRadius: 20 } },
  h(native.Text, { style: { fontSize: 20, fontWeight: '700', color: '#FF6B35' } }, `Accueil · ${width} px`),
  sectionTitle('PRIORITÉS'),
  h(HomeActivityCards, {
    featuredDriverUpcomingTrip: trip, featuredDriverUpcomingTripSeatsLabel: '4 places libres',
    highlightedDriverRequest: request, highlightedRequestDistance: 750,
    router: { push: noop }, openTripRequestDetail: noop, prioritiesEnabled: true, dismissPriority: noop,
  }),
  sectionTitle('TRAJETS PUBLIÉS'),
  h(TripPreviewCard, { cardWidth: width - 24, trip, isBooked: true, isSelected: true, onOpen: noop }),
  h(TripPreviewCard, { cardWidth: width - 24, trip: { ...trip, driverAvatar: undefined, price: 0, driverName: 'Une conductrice au nom très long', driverRating: 0 }, onOpen: noop }),
  sectionTitle('DEMANDES'),
  h(TripRequestPreviewCard, { cardWidth: width - 24, request, onOpen: noop }),
  h(TripRequestPreviewCard, { cardWidth: width - 24, request: { ...request, maxPricePerSeat: 125000, numberOfSeats: 4 }, onOpen: noop }),
);
const markup = renderToStaticMarkup(h(native.View, {
  style: { padding: 20, gap: 24, flexDirection: 'row', alignItems: 'flex-start' },
}, phone(300), phone(390)));
const css = native.StyleSheet.getSheet().textContent;
const directory = path.resolve(__dirname, '../.expo/home-cards-preview');
fs.mkdirSync(directory, { recursive: true });
fs.writeFileSync(path.join(directory, 'index.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${css} body{margin:0;background:#e6eaee;font-family:Arial,sans-serif}</style>${markup}</html>`);
console.log(path.join(directory, 'index.html'));

// Surrounding layout: real header/sheet and SearchScreen, with static data only.
const { HomeHeader } = load('components/home/HomeHeader.tsx');
const { HomeTripsSheet } = load('components/home/HomeTripsSheet.tsx');
const frame = (width, ...children) => h(native.View, {
  style: { width, height: 760, overflow: 'hidden', backgroundColor: '#E5EDE9', borderRadius: 20 },
}, ...children);
const homeLayout = (width, requests) => frame(width,
  h(HomeHeader, {
    insets: { top: 0 }, firstName: 'Alex', unreadNotifications: 3,
    router: { push: noop }, prioritiesEnabled: true, dismissPriority: noop,
    featuredDriverUpcomingTrip: trip, featuredDriverUpcomingTripSeatsLabel: '4 places libres',
    highlightedDriverRequest: request, highlightedRequestDistance: 750, openTripRequestDetail: noop,
  }),
  h(HomeTripsSheet, {
    sheetBottomOffset: 0, sheetHeight: width <= 360 ? 294 : 298, effectiveTripsSheetOpen: true, onSheetLayout: noop,
    sheetTitle: requests ? 'Demandes de trajet' : 'Trajets publiés', sheetSubtitle: '2 résultats à parcourir',
    isDriver: true, isRequestsSheetMode: requests, setHomeSheetMode: noop, toggleTripsSheet: noop,
    openSheetIndex: noop, availableDriverRequests: [request, request], latestTrips: [trip, trip],
    bookedTripIds: new Set(), tripCardWidth: Math.min(width - 40, 354), openTripRequestDetail: noop, openTripDetail: noop,
  }),
);
function searchLayout(width, requests) {
  const trips = [trip, { ...trip, driverAvatar: undefined, id: 'free', price: 0, availableSeats: 1 }];
  const requestsData = [request, { ...request, id: 'large', maxPricePerSeat: 125000, numberOfSeats: 4 }];
  const controller = {
    router: { back: noop }, firstName: 'Alex', openingTripId: null, openingRequestId: null,
    handleOpenTrip: noop, handleOpenTripRequest: noop, draftDeparture: '', draftArrival: '',
    setDraftDeparture: noop, setDraftArrival: noop, desiredSeats: 1, updateDesiredSeats: noop,
    searchMode: requests ? 'requests' : 'trips', setSearchMode: noop, sortMode: requests ? 'nearby' : 'early',
    setSortMode: noop, resultsCountLabel: requests ? '2 demandes trouvées' : '2 trajets trouvés',
    filteredTrips: trips, filteredTripRequests: requestsData, isDriverAccount: true,
    searchResultData: requests ? requestsData.map(request => ({ kind: 'request', request })) : trips.map(trip => ({ kind: 'trip', trip })),
  };
  const SearchScreen = loader({ ...previewMocks,
    'react-native-safe-area-context': { SafeAreaView: ({ edges, ...props }) => h(native.View, props) },
    '@/hooks/search/useSearchController': { useSearchController: () => controller },
  })('app/search.tsx').default;
  return frame(width, h(SearchScreen));
}
const layoutMarkup = renderToStaticMarkup(h(native.View, { style: { padding: 16, gap: 16 } },
  h(native.View, { style: { flexDirection: 'row', gap: 16 } }, homeLayout(320, true), homeLayout(390, false)),
  h(native.View, { style: { flexDirection: 'row', gap: 16 } }, searchLayout(320, true), searchLayout(390, false)),
));
fs.writeFileSync(path.join(directory, 'layout.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${native.StyleSheet.getSheet().textContent} body{margin:0;background:#e6eaee;font-family:Arial,sans-serif}</style>${layoutMarkup}</html>`);
console.log(path.join(directory, 'layout.html'));

const { PublishedTripCard, BookingTripCard, getTripStatusBadge, getBookingStatusBadge } = load('features/trips/TripListCards.tsx');
const { ManageTripBookings } = load('features/manage-trip/ManageTripBookings.tsx');
const publishedTrip = { ...trip, departureTime: new Date(Date.now() + 7200000).toISOString(), status: 'upcoming' };
const bookedTrip = { id: 'reservation', tripId: trip.id, trip: publishedTrip, status: 'accepted', numberOfSeats: 2,
  passengerId: 'passenger', passengerName: 'Marie Test', passengerDestination: 'Université de Kinshasa', passengerAvatar: previewPhoto };
function driverLists(width) {
  return h(native.View, { style: { width, padding: 12, gap: 8, backgroundColor: '#F7F8FA', borderRadius: 20 } },
    sectionTitle('MES TRAJETS · PUBLIÉS'),
    h(PublishedTripCard, { trip: publishedTrip, status: getTripStatusBadge(publishedTrip), canManage: true, onDetails: noop, onEdit: noop, onDelete: noop }),
    h(PublishedTripCard, { trip: { ...publishedTrip, status: 'ongoing', tripRequestId: 'request', price: 0 },
      status: getTripStatusBadge({ ...publishedTrip, status: 'ongoing' }), canManage: true, onDetails: noop, onEdit: noop }),
    sectionTitle('MES TRAJETS · RÉSERVATIONS'),
    h(BookingTripCard, { booking: bookedTrip, status: getBookingStatusBadge(bookedTrip), onDetails: noop }),
    h(BookingTripCard, { booking: { ...bookedTrip, status: 'boarding_uncertain' },
      status: getBookingStatusBadge({ ...bookedTrip, status: 'boarding_uncertain' }), onDetails: noop }),
    sectionTitle('RÉSERVATIONS REÇUES'),
    h(ManageTripBookings, {
      state: { trip: { ...publishedTrip, status: 'ongoing' }, router: { push: noop } },
      actions: { handleOpenNavigation: noop }, bookingsActions: {},
      tracking: { visibleBookings: [{ ...bookedTrip, id: 'pending', status: 'pending' }, bookedTrip,
        { ...bookedTrip, id: 'finished', pickedUp: true, pickedUpConfirmedByPassenger: true,
          droppedOff: true, droppedOffConfirmedByPassenger: true }] },
    }),
  );
}
const driverMarkup = renderToStaticMarkup(h(native.View, { style: { padding: 16, gap: 16, flexDirection: 'row', alignItems: 'flex-start' } },
  driverLists(320), driverLists(390)));
fs.writeFileSync(path.join(directory, 'driver-lists.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${native.StyleSheet.getSheet().textContent} body{margin:0;background:#e6eaee;font-family:Arial,sans-serif}</style>${driverMarkup}</html>`);
console.log(path.join(directory, 'driver-lists.html'));

const { BookingListCard } = load('features/bookings/BookingListCard.tsx');
const { RequestListCard } = load('features/requests/RequestListCard.tsx');
function personalLists(width) {
  const actions = { activeTab: 'active', router: { push: noop }, handleCancel: noop,
    setSelectedDriverName: noop, setSelectedDriverPhone: noop, setContactModalVisible: noop };
  return h(native.View, { style: { width, padding: 12, backgroundColor: '#F7F8FA', borderRadius: 20 } },
    sectionTitle('MES DEMANDES'),
    h(RequestListCard, { request, own: true, featured: true, onOpen: noop }),
    h(RequestListCard, { request: { ...request, status: 'driver_selected', tripId: trip.id,
      selectedDriverId: 'driver', selectedDriverName: 'Alex Test', selectedDriverAvatar: previewPhoto }, own: true, onOpen: noop }),
    h(RequestListCard, { request: { ...request, status: 'offers_received', maxPricePerSeat: 125000,
      offers: [{ status: 'pending' }, { status: 'pending' }] }, own: true, onOpen: noop }),
    sectionTitle('MES RÉSERVATIONS'),
    h(BookingListCard, { ...actions, booking: bookedTrip }),
    h(BookingListCard, { ...actions, booking: { ...bookedTrip,
      trip: { ...publishedTrip, status: 'ongoing', driver: { phone: '000' } } } }),
    h(BookingListCard, { ...actions, booking: { ...bookedTrip, pickedUp: true } }),
    h(BookingListCard, { ...actions, activeTab: 'history', booking: { ...bookedTrip,
      status: 'completed', droppedOffConfirmedByPassenger: true } }),
  );
}
const personalMarkup = renderToStaticMarkup(h(native.View, { style: { padding: 16, gap: 16, flexDirection: 'row', alignItems: 'flex-start' } },
  personalLists(320), personalLists(390)));
fs.writeFileSync(path.join(directory, 'personal-lists.html'), `<!doctype html><html lang="fr"><meta charset="utf-8"><style>${native.StyleSheet.getSheet().textContent} body{margin:0;background:#e6eaee;font-family:Arial,sans-serif}</style>${personalMarkup}</html>`);
console.log(path.join(directory, 'personal-lists.html'));
