const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const native = { View: 'View', Text: 'Text', Image: 'Image', StyleSheet: { create: x => x, absoluteFillObject: {} } };
const mocks = { 'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' } };
const { pickupDriverDetails } = loader(mocks)('features/navigation/PickupDriverDetails.tsx');
const collect = node => !node || typeof node !== 'object' ? [] : Array.isArray(node) ? node.flatMap(collect)
  : [node, ...collect(node.props?.children)];
const trip = { id: 'trip', driverId: 'driver', driverName: 'Alex Test', driverAvatar: 'https://example.test/old.jpg',
  driver: { id: 'driver', firstName: 'Alex', lastName: 'Test', profilePicture: 'https://example.test/photo.jpg' } };

test('pickup uses the assigned driver identity and rejects inconsistent or removed photos', () => {
  assert.deepEqual(pickupDriverDetails(trip), { name: 'Alex Test', photo: trip.driver.profilePicture });
  assert.deepEqual(pickupDriverDetails({ ...trip, driver: undefined }), { name: 'Alex Test', photo: trip.driverAvatar });
  assert.deepEqual(pickupDriverDetails({ ...trip, driver: { ...trip.driver, id: 'other' } }), { name: '', photo: '' });
  assert.equal(pickupDriverDetails({ ...trip, driver: { ...trip.driver, profilePicture: null } }).photo, '');
  assert.equal(pickupDriverDetails({ ...trip, driver: { ...trip.driver, profilePicture: 'profiles/key.jpg' } }).photo, '');
  assert.deepEqual(pickupDriverDetails(null), { name: '', photo: '' });
});

test('photo is bounded, accessible and falls back once on download failure without retrying', () => {
  const hooks = hookHarness();
  const { PickupDriverDetails } = loader({ ...mocks, react: { ...React, ...hooks.react } })('features/navigation/PickupDriverDetails.tsx');
  const props = pickupDriverDetails(trip);
  const render = (values = props) => collect(hooks.render(() => PickupDriverDetails.type(values)));
  const photo = render().find(node => node.type === 'Image');
  assert.equal(photo.props.source.uri, props.photo);
  assert.equal(photo.props.style.width, 52);
  assert.equal(photo.props.style.height, 52);
  assert.equal(photo.props.fadeDuration, 0);
  assert.equal(photo.props.resizeMethod, 'resize');
  assert.equal(photo.props.accessibilityLabel, 'Photo de Alex Test');
  photo.props.onError();
  assert.equal(render().some(node => node.type === 'Image'), false);
  assert.ok(render().some(node => node.props.children === 'Photo non disponible'));
  assert.equal(render({ ...props, photo: 'https://example.test/replacement.jpg' }).some(node => node.type === 'Image'), true);
  hooks.unmount();
});

test('vehicle reminder includes driver identity even if vehicle data is missing', () => {
  const load = loader(mocks);
  const { PickupDriverDetails } = load('features/navigation/PickupDriverDetails.tsx');
  const { PickupVehicleDetails } = load('features/navigation/PickupVehicleDetails.tsx');
  for (const vehicle of [undefined, { brand: 'Toyota', model: 'Yaris', licensePlate: '1234AB01' }]) {
    const nodes = collect(PickupVehicleDetails({ trip: { ...trip, vehicle } }));
    const driver = nodes.find(node => node.type === PickupDriverDetails);
    assert.equal(driver.props.name, 'Alex Test');
    assert.equal(driver.props.photo, trip.driver.profilePicture);
  }
});

test('pickup resolution fills a missing driver from the same trip but never overwrites a current identity', () => {
  const { resolvePickupVehicleTrip } = loader()('features/navigation/pickupAwareness.ts');
  const vehicle = { id: 'vehicle', brand: 'Toyota' };
  const previous = { ...trip, vehicleId: vehicle.id, vehicle };
  const current = { id: trip.id, driverId: trip.driverId, vehicleId: vehicle.id, vehicle };
  assert.equal(resolvePickupVehicleTrip(trip.id, current, previous).driver, trip.driver);
  const newIdentity = { ...trip.driver, profilePicture: null };
  const withNewIdentity = resolvePickupVehicleTrip(trip.id, { ...current, vehicle: undefined, driver: newIdentity }, previous);
  assert.equal(withNewIdentity.vehicle, vehicle);
  assert.equal(withNewIdentity.driver, newIdentity);
  assert.equal(pickupDriverDetails(withNewIdentity).photo, '');
  const otherDriver = { ...current, driverId: 'other', vehicle: undefined };
  assert.equal(resolvePickupVehicleTrip(trip.id, otherDriver, previous), otherDriver);
});

test('photo policy handles API error envelopes and opens profile without replacing the form', () => {
  const { isPublicationPhotoRequired, publicationPhotoDialog } = loader()('features/publish/publicationPhotoPolicy.ts');
  for (const error of [null, 'failure', { data: { code: 'DRIVER_REQUIRED' } }]) assert.equal(isPublicationPhotoRequired(error), false);
  for (const error of [{ code: 'DRIVER_PROFILE_PHOTO_REQUIRED' }, { data: { code: 'DRIVER_PROFILE_PHOTO_REQUIRED' } },
    { data: { error: { code: 'DRIVER_PROFILE_PHOTO_REQUIRED' } } }]) assert.equal(isPublicationPhotoRequired(error), true);
  const opened = [];
  const dialog = publicationPhotoDialog({ push: path => opened.push(path) });
  assert.equal(dialog.variant, 'warning');
  assert.match(dialog.message, /formulaire reste conservé/);
  assert.equal(dialog.actions[0].onPress, undefined);
  dialog.actions[1].onPress();
  assert.deepEqual(opened, ['/edit-profile']);
});

test('publication photo refusal unlocks submission, keeps the draft and does not reconcile or auto-submit', async () => {
  const dialogs = [], navigations = [], successes = [];
  const { usePublishSubmission } = loader({
    '../../features/publish/publishModel': { getLocationCoordinates: () => [15, -4], isUserDriver: () => true },
    '@/services/analytics': { trackEvent() { throw Error('must not record success'); } },
    '@/utils/mutationReconciliation': { reconcileAmbiguousMutation() { throw Error('must not reconcile a definitive refusal'); } },
  })('hooks/publish/usePublishSubmission.ts');
  const ref = { current: false };
  const props = {
    publishInFlightRef: ref, isSubmittingTrip: false, hasDepartureAddress: true, hasArrivalAddress: true,
    seats: '2', price: '2500', departureDateTime: new Date('2030-01-01T12:00:00Z'), isDriver: true,
    selectedVehicleId: 'vehicle', isPublishIdentityVerified: true, departureAddress: 'A', arrivalAddress: 'B',
    departureReference: '', arrivalReference: '', description: '',
    createTrip: () => ({ unwrap: async () => { throw { data: { code: 'DRIVER_PROFILE_PHOTO_REQUIRED' } }; } }),
    showDialog: value => dialogs.push(value), router: { push: path => navigations.push(path) },
    setPublicationSuccess: value => successes.push(value),
  };
  await usePublishSubmission(props).handlePublish();
  assert.equal(ref.current, false);
  assert.equal(dialogs.length, 1);
  assert.equal(successes.length, 0);
  assert.equal(navigations.length, 0);
  assert.equal(props.departureAddress, 'A');
  dialogs[0].actions[1].onPress();
  assert.deepEqual(navigations, ['/edit-profile']);
});
