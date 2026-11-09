// Synthetic state for layout assertions and local previews, never connected to an account.
const noop = () => {};
function homeRequestFixture(overrides = {}) {
  return {
    isHomeEntry: true, isScreenActive: true, hasAppliedRoutePrefill: true, requestFormStep: 'details',
    departureLocation: { title: 'Avenue des Aviateurs', address: 'Avenue des Aviateurs', latitude: -4.31, longitude: 15.29 },
    arrivalLocation: { title: 'Gare Centrale, Gombe', address: 'Gare Centrale, Gombe', latitude: -4.30, longitude: 15.32 },
    departureAddress: 'Avenue des Aviateurs', arrivalAddress: 'Gare Centrale, Gombe',
    departureReference: '', arrivalReference: '', description: '', selectedVehicleType: 'car', selectedVehicleTypes: ['car'],
    hasDepartureAddress: true, hasArrivalAddress: true, activePicker: null, insets: { top: 0, bottom: 0 },
    timePreset: 'now', hasChosenDepartureTime: true, departureDateMin: new Date('2030-11-09T13:00:00Z'),
    flexibilityMinutes: 30, timeSummary: 'Départ demain à 13:00', vehicleOptions: [], isPriceLoading: false,
    budgetValue: 3500, budgetLabel: '3 500 FC', totalBudgetLabel: '3 500 FC', budgetHintLabel: 'Prix recommandé pour le trajet',
    numberOfSeats: 1, requestSeatsLabel: '1 place', requestPaymentMode: 'cash', targetDriver: null,
    directDriverPrefill: { blocked: false, status: 'none' }, routeCoordinates: [], routeDistanceLabel: '4,2 km',
    routePreviewRegion: { latitude: -4.31, longitude: 15.30, latitudeDelta: 0.04, longitudeDelta: 0.04 },
    primaryLabel: 'Commander le trajet', primaryButtonDisabled: false, canSubmitRequestDetails: true, isCreating: false,
    createdRequestId: null, isRequestSuccessVisible: false, submissionError: null,
    setSelectedVehicleTypes: noop, applyPreset: noop, setHasChosenDepartureTime: noop,
    setNumberOfSeats: noop, setHasSpecifiedNumberOfSeats: noop, updateBudget: noop, retryVehicleOptions: noop,
    setRequestPaymentMode: noop, setShowAdvanced: noop, setDescription: noop, setDepartureReference: noop,
    setArrivalReference: noop, setTargetDriver: noop, setActivePicker: noop, handlePrimaryAction: noop,
    ...overrides,
  };
}
const homeRequestBoundaryMocks = {
  '@/components/LocationPickerModal': { __esModule: true, default: 'Picker', LocationPickerContent: 'InlinePicker' },
  '@/components/trip-request/DirectDriverNotice': { DirectDriverNotice: () => null },
  './DirectDriverNotice': { DirectDriverNotice: () => null },
  './RequestDriverPicker': { RequestDriverPicker: 'DriverPicker' },
  './RequestDatePickerModal': { RequestDatePickerModal: () => null },
  './RequestSuccessModal': { RequestSuccessModal: () => null },
  '@/hooks/useIdentityCheck': { useIdentityCheck: () => ({ isIdentityVerified: true, checkIdentity: noop }) },
  '@/components/PassengerSeatNotice': { PassengerSeatNotice: () => null },
};
module.exports = { homeRequestFixture, homeRequestBoundaryMocks };
