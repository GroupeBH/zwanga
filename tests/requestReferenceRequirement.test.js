const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { requiresRequestReference: required, missingRequestReference: missing } = loader()('features/trip-request/requestReference.ts');

test('communes, city-only labels and map-only points require a reference, regardless of typography', () => {
  for (const label of ['Gombe', ' LEMBA ', 'Limete, Kinshasa, RDC', 'Maluku', 'Mont-Ngafula',
    'N’djili', 'Ngiri-ngiri', 'Kasa-Vubu', 'Selembao', 'Kinshasa, République démocratique du Congo',
    'Commune de Kadutu', 'Quartier Matonge', 'Point sélectionné', 'Ma position', 'Point de départ (voir la carte)',
    'J847+GW Kinshasa', 'Unnamed road, Kinshasa']) assert.equal(required(label), true, label);
  assert.equal(missing('Gombe', ' \n '), true);
  assert.equal(missing('Gombe', 'Devant la pharmacie'), false);
});

test('streets and named places remain usable without a reference; do not match commune substrings', () => {
  for (const label of ['Avenue des Aviateurs, Gombe', 'Av. de la Victoire', 'Boulevard du 30 Juin',
    '2 Av. de la Victoire', '111 Yonsomba', 'Gare Centrale, Gombe', 'Université Pédagogique Nationale (UPN)',
    'Marché de Lemba', 'Hôpital de Ngaliema', 'École Gombe', 'Route Matadi']) {
    assert.equal(required(label), false, label); assert.equal(missing(label, ''), false);
  }
  assert.equal(required(''), false); assert.equal(required(null), false);
});

test('structured metadata covers other communes without hard-coding their names', () => {
  assert.equal(required('Ibanda', { placeTypes: ['political', 'sublocality_level_1'] }), true);
  const location = { addressComponents: [{ longName: 'Kadutu', types: ['sublocality'] }, { longName: 'Bukavu', types: ['locality'] }] };
  assert.equal(required('Kadutu, Bukavu', location), true);
  assert.equal(required('Avenue des Écoles, Kadutu', location), false);
  assert.equal(required('Marché Central', { placeTypes: ['point_of_interest', 'sublocality'] }), false);
  // A street hidden in metadata is not enough when only the commune is sent to the driver.
  assert.equal(required('Gombe', { addressComponents: [{ longName: 'Avenue test', types: ['route'] }] }), true);
});
