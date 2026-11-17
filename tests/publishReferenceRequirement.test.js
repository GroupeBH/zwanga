const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const noop = () => {};
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree)
  ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => typeof tree === 'string' ? tree : Array.isArray(tree)
  ? tree.map(text).join('') : text(tree?.props?.children ?? '');
const point = address => ({ latitude: -4.31, longitude: 15.29, title: address, address });
const native = os => ({ View: 'View', Text: 'Text', TextInput: 'Input', TouchableOpacity: 'Button',
  Platform: { OS: os }, StyleSheet: { create: value => value } });

function routeFixture(os, overrides = {}) {
  const hooks = hookHarness();
  const load = loader({ react: hooks.react, 'react-native': native(os), 'react-native-maps': {},
    '@react-native-community/datetimepicker': {}, '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/currentLocationSelection': { buildCurrentLocationSelection: () => assert.fail('no GPS lookup needed') },
    '../screen-styles/app/publish/index': { styles: {} },
    '@/components/address/ManualAddressStatus': { ManualAddressStatus: 'Status' },
  });
  const props = { manualAddressTarget: null, departureLocation: point('Gombe'), arrivalLocation: point('Matadi'),
    departureManualAddress: '', arrivalManualAddress: '', departureReference: '', arrivalReference: '',
    showDepartureReference: false, showArrivalReference: false,
    departurePointStatus: 'confirmed', arrivalPointStatus: 'confirmed', routeCoordinates: [],
    departureAutoFillStartedRef: { current: true }, departureTouchedRef: { current: true },
    renderGpsStatus: () => null, setShowDepartureReference: noop, setShowArrivalReference: noop,
    setDepartureReference: value => { props.departureReference = value; },
    setArrivalReference: value => { props.arrivalReference = value; }, ...overrides };
  const hook = load('hooks/publish/usePublishRoutePreview.ts').usePublishRoutePreview;
  const Fields = load('features/publish/PublishRouteFields.tsx').PublishRouteFields;
  const render = () => hooks.render(() => hook(props));
  return { props, hooks, render, fields: () => Fields({ ...props, ...render() }) };
}

for (const os of ['android', 'ios']) {
  test(`${os}: commune-only publication addresses reveal mandatory references without extra taps`, () => {
    const f = routeFixture(os);
    let state = f.render();
    assert.equal(state.missingReferenceTarget, 'departure');
    for (const name of ['departureReferenceRequired', 'arrivalReferenceRequired', 'shouldShowDepartureReference', 'shouldShowArrivalReference']) {
      assert.equal(state[name], true, name);
    }
    const tree = f.fields(), inputs = nodes(tree).filter(n => n.type === 'Input');
    assert.equal(inputs.length, 2);
    assert.match(text(tree), /Référence de départ · obligatoire/);
    assert.match(text(tree), /Référence d’arrivée · obligatoire/);
    assert.equal(nodes(tree).filter(n => n.type === 'Icon' && n.props.name === 'close').length, 0);
    for (const input of inputs) {
      assert.match(input.props.accessibilityLabel, /obligatoire/);
      assert.equal(input.props.maxLength, 200);
    }
    inputs[0].props.onChangeText('   ');
    assert.equal(f.render().missingReferenceTarget, 'departure', 'spaces are not a reference');
    inputs[0].props.onChangeText('Devant la pharmacie');
    assert.equal(f.render().missingReferenceTarget, 'arrival');
    inputs[1].props.onChangeText('Entrée du marché');
    state = f.render(); assert.equal(state.missingReferenceTarget, null);
    assert.equal(state.shouldShowDepartureReference, true, 'filled required reference stays visible');
    f.hooks.unmount();
  });

  test(`${os}: detailed places stay optional; manual and GPS placeholders follow the same rule`, () => {
    const f = routeFixture(os, { departureLocation: point('Avenue des Aviateurs, Gombe'), arrivalLocation: point('Gare Centrale, Matadi') });
    assert.equal(f.render().missingReferenceTarget, null);
    assert.equal(nodes(f.fields()).filter(n => n.type === 'Input').length, 0);
    f.props.manualAddressTarget = 'departure'; f.props.departureManualAddress = 'Selembao'; f.props.departureLocation = null;
    assert.equal(f.render().missingReferenceTarget, 'departure');
    f.props.departureManualAddress = '12 Avenue des Écoles';
    assert.equal(f.render().missingReferenceTarget, null);
    f.props.manualAddressTarget = null; f.props.departureLocation = point('Ma position');
    assert.equal(f.render().missingReferenceTarget, 'departure');
    f.props.departureLocation = { ...point('Zone test'), placeTypes: ['locality'] };
    assert.equal(f.render().missingReferenceTarget, 'departure', 'structured place metadata is retained');
    f.props.departureLocation = point('Avenue des Écoles'); f.props.showDepartureReference = true;
    const optional = nodes(f.fields()).find(n => n.type === 'Input');
    assert.match(optional.props.accessibilityLabel, /facultative/);
    assert.ok(nodes(f.fields()).some(n => n.type === 'Icon' && n.props.name === 'close'));
    f.hooks.unmount();
  });
}

function submissionFixture(recurring) {
  const hooks = hookHarness(), missing = [], posts = [], successes = [], reads = [];
  const io = { resolved: null };
  const load = loader({ react: hooks.react, 'react-native': native('android'), 'react-native-maps': {},
    '@react-native-community/datetimepicker': {},
    '@/services/tokenSession': { getTokenSessionVersion: () => 0 },
    '@/services/analytics': { trackEvent: noop }, '@/services/driverPermissionOnboarding': { recordDriverPublication: noop },
    '@/services/sharedRouteAddresses': { resolveSharedRouteAddresses: async (departure, arrival) => {
      reads.push('geocode'); return io.resolved ?? { departureAddress: departure.text, arrivalAddress: arrival.text };
    } },
  });
  const create = payload => { posts.push(payload); return { unwrap: async () => ({ id: 'test-trip' }) }; };
  const props = { publishInFlightRef: { current: false }, hasDepartureAddress: true, hasArrivalAddress: true,
    seats: '2', price: '2500', isFreeTrip: false, acceptedPaymentModes: ['points'],
    departureDateTime: new Date('2030-01-01T12:00:00Z'), isDriver: true, selectedVehicleId: 'test-car',
    isPublishIdentityVerified: true, isRecurringTrip: recurring, recurringWeekdays: [1, 3],
    departureAddress: 'Avenue des Aviateurs', arrivalAddress: 'Gare Centrale',
    departureLocation: point('Avenue des Aviateurs'), arrivalLocation: point('Gare Centrale'),
    departureReference: '', arrivalReference: '', description: '',
    formatDateOnlyValue: () => '2030-01-01', formatTimeOnlyValue: () => '12:00',
    onMissingReference: target => missing.push(target), createTrip: create, createRecurringTrip: create,
    setPublicationSuccess: value => successes.push(value),
    getMyTrips: () => assert.fail('no recovery before a write'), getMyRecurringTrips: () => assert.fail('no recovery before a write'),
    showDialog: () => assert.fail('unexpected publication error'),
  };
  const useSubmission = load('hooks/publish/usePublishSubmission.ts').usePublishSubmission;
  return { props, io, hooks, missing, posts, reads, successes, render: () => hooks.render(() => useSubmission(props)) };
}

for (const recurring of [false, true]) {
  for (const target of ['departure', 'arrival']) {
    for (const stage of ['before-geocode', 'after-geocode']) {
      test(`${recurring ? 'recurring' : 'single'} publication blocks missing ${target} reference ${stage}, then sends the trimmed reference`, async () => {
        const f = submissionFixture(recurring);
        const addressKey = `${target}Address`, referenceKey = `${target}Reference`;
        if (stage === 'before-geocode') f.props[addressKey] = 'Gombe';
        else f.io.resolved = { departureAddress: f.props.departureAddress, arrivalAddress: f.props.arrivalAddress, [addressKey]: 'Gombe' };
        f.props[referenceKey] = '   ';
        await f.render().handlePublish();
        assert.deepEqual(f.missing, [target]);
        assert.equal(f.posts.length, 0); assert.equal(f.successes.length, 0);
        assert.equal(f.reads.length, stage === 'before-geocode' ? 0 : 1);
        assert.equal(f.props.publishInFlightRef.current, false);
        assert.equal(f.render().isResolvingAddresses, false);
        f.props[referenceKey] = '  Devant la pharmacie  ';
        const form = f.render(); await Promise.all([form.handlePublish(), form.handlePublish()]);
        assert.equal(f.posts.length, 1, 'no duplicate publication');
        assert.equal(f.posts[0][referenceKey], 'Devant la pharmacie');
        assert.equal(f.posts[0][`${target}Location`], 'Gombe');
        assert.equal(f.posts[0].pricePerSeat, 2500); assert.equal(f.posts[0].totalSeats, 2);
        assert.deepEqual(f.posts[0].acceptedPaymentModes, ['points']);
        assert.deepEqual(f.successes, [{ id: 'test-trip', recurring }]);
        f.hooks.unmount();
      });
    }
  }
}
