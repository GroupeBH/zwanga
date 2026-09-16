const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { readableLocation, cleanLocationText, UNKNOWN_LOCATION_ADDRESS } = loader()('utils/readableLocation.ts');
const component = (longName, type) => ({ longName, types: [type] });

test('the screenshot address uses the avenue, not its leading location code', () => {
  assert.deepEqual(readableLocation({
    name: 'J83F+5G4', formattedAddress: 'J83F+5G4, Av. Bakole 1, Kinshasa, RDC',
  }), { title: 'Av. Bakole 1', address: 'Av. Bakole 1, Kinshasa, RDC' });
});

test('an avenue appearing after a neighborhood becomes the title and first address fragment', () => {
  const formattedAddress = 'Q/Mazamba Domicile, 3b Av Matadi, Kinshasa, RDC';
  for (const response of [
    { formattedAddress },
    { name: 'Q/Mazamba Domicile', formattedAddress },
    { formattedAddress, addressComponents: [component('Q/Mazamba Domicile', 'premise'), component('Mazamba', 'neighborhood')] },
    { formattedAddress, addressComponents: [component('Av Matadi', 'route')] },
    { formattedAddress, addressComponents: [component('Avenue Matadi', 'route')] },
    { formattedAddress, addressComponents: [component('Av Matadi', 'route'), component('3b', 'street_number')] },
  ]) {
    assert.deepEqual(readableLocation(response), {
      title: '3b Av Matadi', address: '3b Av Matadi, Q/Mazamba Domicile, Kinshasa, RDC',
    });
  }
});

test('text street detection supports numbered local abbreviations without treating a place name as a road', () => {
  for (const street of ['Av.Matadi', '3b av. Matadi', '12 bis Avenue du 24 Novembre', 'Bd du 30 Juin', 'Rte Kimwenza', 'Rue des Écoles']) {
    assert.equal(readableLocation({ formattedAddress: `Quartier Mazamba, ${street}, Kinshasa` }).title, street);
  }
  assert.equal(readableLocation({ formattedAddress: "Quartier Mazamba, Église de l'Avenue, Kinshasa" }).title, 'Quartier Mazamba');
  assert.equal(readableLocation({ formattedAddress: 'Mazamba, Avril, Kinshasa' }).title, 'Mazamba');
});

test('a provider name matching a structured neighborhood yields to the street, but a real landmark or favorite does not', () => {
  const response = { formattedAddress: 'Mazamba, 3b Av Matadi, Kinshasa', addressComponents: [component('Mazamba', 'neighborhood')] };
  assert.equal(readableLocation({ ...response, name: 'Mazamba' }).title, '3b Av Matadi');
  assert.equal(readableLocation({ ...response, name: 'Maison' }).title, 'Maison');
  assert.equal(readableLocation({ ...response, name: 'Église La Compassion' }).title, 'Église La Compassion');
  assert.equal(readableLocation({ ...response, name: 'Maison, entrée arrière' }).title, 'Maison, entrée arrière');
  assert.equal(readableLocation({ name: 'Q/Mazamba Domicile', formattedAddress: 'Q/Mazamba Domicile, Kinshasa' }).title, 'Q/Mazamba Domicile');
});

test('a structured street is not confused with a different road in the formatted context', () => {
  const result = readableLocation({ formattedAddress: 'Q/Mazamba, Rue Matadi, Kinshasa', addressComponents: [
    component('Avenue Matadi', 'route'), component('3b', 'street_number'),
  ] });
  assert.equal(result.title, '3b Avenue Matadi');
  assert.equal(result.address, '3b Avenue Matadi, Q/Mazamba, Rue Matadi, Kinshasa');
});

test('short, global, padded and compact codes disappear without damaging local names', () => {
  for (const code of ['J83F+5G4', 'j83f+5g4', '87G8P27Q+MCM', '849V0000+', 'HF6ZT7E']) {
    assert.equal(cleanLocationText(`${code}, Av. Bakole 1, Kinshasa`), 'Av. Bakole 1, Kinshasa');
    assert.equal(cleanLocationText(`${code} Av. Bakole 1, Kinshasa`), 'Av. Bakole 1, Kinshasa');
    assert.equal(cleanLocationText(code), '');
  }
  for (const name of ['UPN', 'RN1', 'Avenue du 24 Novembre', '30 Juin', 'Hôtel F1', 'Hôpital HJ3', 'SHOP123', 'Marché de la Liberté']) {
    assert.equal(cleanLocationText(name), name);
    assert.equal(readableLocation({ name }).title, name);
  }
});

test('structured place/street/neighborhood names have priority regardless of component order', () => {
  const base = { formattedAddress: 'J83F+5G4, Kinshasa', addressComponents: [
    component('Kinshasa', 'locality'), component('J83F+5G4', 'plus_code'),
    component('Salongo', 'neighborhood'), component('Av. Bakole 1', 'route'), component('12', 'street_number'),
  ] };
  assert.equal(readableLocation(base).title, '12 Av. Bakole 1');
  assert.equal(readableLocation({ ...base, addressComponents: [...base.addressComponents, component('Paroisse Elimo Santu', 'point_of_interest')] }).title, 'Paroisse Elimo Santu');
  assert.equal(readableLocation({ ...base, name: 'Maison' }).title, 'Maison');
  assert.equal(readableLocation({ ...base, name: 'Maison, entrée arrière' }).title, 'Maison, entrée arrière');
  assert.equal(readableLocation({ ...base, addressComponents: base.addressComponents.slice(0, 3) }).title, 'Salongo');
});

test('a code-only response uses structured context or an honest fallback, never invents a landmark', () => {
  assert.deepEqual(readableLocation({ formattedAddress: 'J83F+5G4', addressComponents: [
    component('Kinshasa', 'locality'), component('Salongo', 'neighborhood'),
  ] }), { title: 'Salongo', address: 'Salongo, Kinshasa' });
  assert.deepEqual(readableLocation({ name: 'HF6ZT7E', formattedAddress: 'J83F+5G4' }), {
    title: 'Point sélectionné', address: UNKNOWN_LOCATION_ADDRESS,
  });
  assert.equal(readableLocation({ formattedAddress: 'Unnamed Road, Lemba, Kinshasa' }).title, 'Lemba');
  assert.deepEqual(readableLocation({ formattedAddress: 'Unnamed Road' }), {
    title: 'Point sélectionné', address: UNKNOWN_LOCATION_ADDRESS,
  });
  assert.equal(cleanLocationText('Salongo, Kinshasa, Kinshasa'), 'Salongo, Kinshasa');
});

test('manual address entry retains its human label and exact geocoded coordinates', () => {
  const { mapGeocodeResponseToSelection } = loader()('utils/manualAddressGeocode.ts');
  const selection = mapGeocodeResponseToSelection('Paroisse Elimo Santu', {
    lat: -4.38, lng: 15.32, formattedAddress: 'J83F+5G4, Av. Bakole 1, Kinshasa',
  });
  assert.deepEqual(selection, { title: 'Paroisse Elimo Santu', address: 'Av. Bakole 1, Kinshasa', latitude: -4.38, longitude: 15.32 });
});

test('native GPS geocoding uses a readable street and preserves coordinates', async () => {
  const point = { latitude: -4.38, longitude: 15.32 };
  let calls = 0;
  const { buildCurrentLocationSelection } = loader({ 'expo-location': {
    reverseGeocodeAsync: async value => {
      calls++; assert.deepEqual(value, point);
      return [{ name: 'J83F+5G4', street: 'Av. Bakole 1', district: 'Salongo', city: 'Kinshasa', region: 'Kinshasa' }];
    },
  } })('utils/currentLocationSelection.ts');
  assert.deepEqual(await buildCurrentLocationSelection(point), { ...point, title: 'Av. Bakole 1', address: 'Av. Bakole 1, Salongo, Kinshasa' });
  assert.equal(calls, 1);
});

test('offline native geocoding retains a usable GPS point with no invented place', async () => {
  const { buildCurrentLocationSelection } = loader({ 'expo-location': {
    reverseGeocodeAsync: async () => { throw new Error('offline'); },
  } })('utils/currentLocationSelection.ts');
  assert.deepEqual(await buildCurrentLocationSelection({ latitude: -4.38, longitude: 15.32 }), {
    latitude: -4.38, longitude: 15.32, title: 'Ma position', address: UNKNOWN_LOCATION_ADDRESS,
  });
});

test('Places suggestions and details hide codes without changing IDs or issuing extra requests', async () => {
  const calls = [];
  const place = { placeId: 'place-id', name: 'J83F+5G4', formattedAddress: 'J83F+5G4, Av. Bakole 1, Kinshasa', lat: -4.38, lng: 15.32 };
  const data = {
    autocomplete: [{ placeId: place.placeId, mainText: place.name, description: place.formattedAddress, secondaryText: 'Av. Bakole 1, Kinshasa' }],
    details: place, search: [place],
  };
  const endpoint = type => ({ initiate: args => { calls.push({ type, args }); return { type }; } });
  const api = loader({
    '@/store': { store: { dispatch: async ({ type }) => ({ data: data[type] }) } },
    '@/store/api/googleMapsApi': { googleMapsApi: { endpoints: {
      placesAutocomplete: endpoint('autocomplete'), getPlaceDetails: endpoint('details'), placesSearch: endpoint('search'),
    } } },
  })('utils/googleMapsPlaces.ts');
  const results = await api.searchGoogleMapsPlaces('J83F+5G4');
  assert.ok(results.length > 0);
  for (const result of results) {
    assert.equal(result.name, 'Av. Bakole 1');
    assert.equal(result.fullAddress, 'Av. Bakole 1, Kinshasa');
    assert.equal(result.id, 'place-id');
  }
  assert.equal(calls[0].args.input, 'J83F+5G4', 'code searches remain possible; only display text changes');
  const before = calls.length;
  const detail = await api.getGoogleMapsPlaceDetails('place-id');
  assert.equal(calls.length, before + 1);
  assert.equal(detail.name, 'Av. Bakole 1');
  assert.deepEqual(detail.coordinates, { latitude: -4.38, longitude: 15.32 });
});
