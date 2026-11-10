// Synthetic local-only presentation state; never connects to a server.
const noop = () => {};
const vehicle = { id: 'preview-car', brand: 'Toyota', model: 'Corolla', licensePlate: 'DEMO', type: 'car', isActive: true };
const departure = { latitude: -4.303, longitude: 15.311, title: 'Gare Centrale, Gombe', address: 'Gare Centrale, Gombe' };
const arrival = { latitude: -4.344, longitude: 15.28, title: 'Kintambo Magasin', address: 'Kintambo Magasin' };
function publishCompactFixture(step = 'route') {
  return {
    step, previousStep: step === 'pricing' ? 'route' : null,
    router: { back: noop }, insets: { bottom: 0 }, publicationSuccess: null,
    navigation: { isStepActive: value => value === step,
      isStepCompleted: value => ['route', 'pricing'].indexOf(value) < ['route', 'pricing'].indexOf(step), goToStep: noop },
    footerPrimaryLabel: step === 'pricing' ? 'Publier mon trajet' : 'Choisir mon prix', handleFooterPrimary: noop,
    pricing: { recommendation: 2500, loading: false, retry: noop, useEstimate: noop },
    departureTouchedRef: { current: true }, handleStartKyc: noop,
    form: { departureLocation: departure, arrivalLocation: arrival, departureManualAddress: '', arrivalManualAddress: '',
      manualAddressTarget: null, activeLocationType: null, departureReference: '', arrivalReference: '',
      departureDateTime: new Date(2030, 4, 12, 17, 30), hasChosenDepartureTime: true,
      recurringWeekdays: [1, 3, 5], isRecurringTrip: false, recurringEndDate: null,
      seats: '3', price: '2500', hasEditedPrice: true, setHasEditedPrice: noop, acceptedPaymentModes: ['electronic', 'points'], isFreeTrip: false,
      requiresPassengerKyc: false, description: '', routeCoordinates: [departure, arrival],
      setSeats: noop, setPrice: noop, setIsFreeTrip: noop, setAcceptedPaymentModes: noop,
      setRequiresPassengerKyc: noop, setDescription: noop, setRecurringEndDate: noop },
    route: { hasDepartureAddress: true, hasArrivalAddress: true, hasDepartureCoordinates: true, hasArrivalCoordinates: true,
      routePreviewRegion: { latitude: -4.32, longitude: 15.3, latitudeDelta: .06, longitudeDelta: .06 } },
    routeResolution: { departureManualGeocodeStatus: 'idle', arrivalManualGeocodeStatus: 'idle' },
    identity: { isPublishIdentityVerified: true, isIdentityStatusKnown: true, kycModalVisible: false, kycChecklist: [] },
    presentation: { renderGpsStatus: () => null,
      departureSummary: { title: departure.address, address: departure.address },
      arrivalSummary: { title: arrival.address, address: arrival.address },
      recurringWeekdayOptions: ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((label, i) => ({ label, value: i + 1 })) },
    scheduleActions: { openDateOrTimePicker: noop, selectDepartureIn: noop, pickerError: null },
    schedule: { formattedDateLabel: 'Aujourd’hui', formattedTimeLabel: '17:30', formattedFullDateTime: 'Aujourd’hui · 17:30',
      formattedRecurringEndDate: 'Sans date de fin', recurringDaysSummary: 'Lun · Mer · Ven',
      toggleRecurringTrip: noop, toggleRecurringWeekday: noop, isSubmittingTrip: false },
    vehicle: { activeVehicles: [vehicle], selectedVehicleId: vehicle.id, isLoadingVehicles: false, setSelectedVehicleId: noop },
    selectedVehicleType: 'car', vehicleEditor: { openVehicleForm: noop, vehicleModalCopy: {} }, vehicleCreation: {},
    locationActions: { openLocationPicker: noop, swapRoutePoints: noop }, submission: {},
  };
}
const hiddenPublishModals = Object.fromEntries(['PublishSuccessOverlay', 'PublishDriverRequiredModal', 'PublishDateTimeModal',
  'PublishIdentityModal'].map(name => [`../features/publish/${name}`, { [name]: () => null }]));
module.exports = { publishCompactFixture, hiddenPublishModals };
