// Synthetic participants and route. Never connected to real accounts.
const noop = () => {};
const request = { id: 'preview-order', passengerId: 'preview-passenger', selectedDriverId: 'preview-driver',
  selectedDriverName: 'Alex M.', status: 'driver_selected', tripId: 'preview-trip', selectedAt: '2026-11-25T15:00:00Z',
  departureDateMin: '2026-11-25T15:00:00Z', departureDateMax: '2026-11-25T16:30:00Z',
  numberOfSeats: 1, vehicleType: 'car', immediateDispatch: true,
  selectedVehicle: { id: 'test-car', brand: 'Toyota', model: 'Corolla', color: 'Gris', licensePlate: 'TEST-001' },
  departure: { name: 'Avenue de démonstration', lat: -4.3, lng: 15.3 }, arrival: { name: 'Avenue de la Gare', lat: -4.32, lng: 15.32 } };
const labels = { departure: { title: request.departure.name, address: request.departure.name, reference: '', context: '' },
  arrival: { title: request.arrival.name, address: request.arrival.name, reference: '', context: '' } };
const booking = { id: 'preview-booking', passengerId: request.passengerId, tripId: request.tripId, status: 'accepted' };
const trip = { id: request.tripId, driverId: request.selectedDriverId, status: 'upcoming' };
const model = { tripRequest: request, userId: request.passengerId, passengerBooking: booking, assignedTrip: trip,
  isScreenActive: true, isOwner: true, canCancel: true, canEdit: false, refreshing: false,
  onRefresh: noop, goHome: noop, handleCancelRequest: noop, handleViewTrip: noop };
const departure = { latitude: -4.3, longitude: 15.3 }, arrival = { latitude: -4.32, longitude: 15.32 };
const presentation = { ownerDisplayedBudget: 8500, requestRouteMapData: { departureCoordinate: departure, arrivalCoordinate: arrival,
  initialRegion: { latitude: -4.31, longitude: 15.31, latitudeDelta: 0.04, longitudeDelta: 0.04 }, fallbackCoordinates: [departure, arrival] },
  displayedRouteCoordinates: [departure, { latitude: -4.31, longitude: 15.32 }, arrival] };
module.exports = { request, labels, model, presentation, booking, trip };
