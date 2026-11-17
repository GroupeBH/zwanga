// Synthetic editor data only; no API, credentials or real user identifiers.
const noop = () => {};
const point = title => ({ title, address: title, latitude: -4.32, longitude: 15.3 });
function tripEditorFixture() {
  return {
    trip: { id: 'test-trip', status: 'upcoming', price: 2500 },
    editTripModalVisible: true, editModalBottomPadding: 20, editStep: 1, isSavingTrip: false,
    closeEditModal: noop, handleSaveTrip: async () => {}, handleBackToEditRoute: noop, handleContinueEditTrip: noop,
    editRouteMode: 'map', setEditRouteMode: noop, swapEditRoutePoints: noop, openEditRoutePicker: noop,
    editDepartureSelection: point('Avenue des Aviateurs'), editArrivalSelection: point('Gare Centrale'),
    editDepartureDisplay: 'Avenue des Aviateurs', editArrivalDisplay: 'Gare Centrale',
    editDepartureManualAddress: 'Avenue des Aviateurs', editArrivalManualAddress: 'Gare Centrale',
    setEditDepartureManualAddress: noop, setEditArrivalManualAddress: noop,
    editReferences: { departureReference: '', arrivalReference: '', setDepartureReference: noop,
      setArrivalReference: noop, clearIfAddressChanged: noop, clearIfLocationChanged: noop, swap: noop, reset: noop },
    editSeats: '3', setEditSeats: noop, editPrice: '2500', setEditPrice: noop,
    formattedEditDate: 'Lun. 16 novembre', formattedEditTime: '15:30',
    getEditBaseDate: () => new Date('2030-11-16T14:30:00Z'), openDateOrTimePicker: noop,
    iosPickerMode: null, handleIosPickerChange: noop, closeIosPicker: noop,
    editVehicleId: 'car-1', setEditVehicleId: noop, editVehiclesLoading: false,
    activeEditVehicles: [{ id: 'car-1', brand: 'Toyota', model: 'Corolla', licensePlate: 'TEST-01', color: 'Gris' },
      { id: 'car-2', brand: 'Honda', model: 'Civic', licensePlate: 'TEST-02', color: 'Blanc' }],
    editRequiresPassengerKyc: false, setEditRequiresPassengerKyc: noop,
  };
}
module.exports = { tripEditorFixture };
