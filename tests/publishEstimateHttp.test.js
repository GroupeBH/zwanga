// Real mobile endpoint builders and submission hook over loopback HTTP.
// The backend responses are fixtures, not a deployed server or physical device.
require('./helpers/localOnlyNetwork.cjs');
const test = require('node:test');
const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const { createServer } = require('node:http');
const { once } = require('node:events');
const { configureStore } = require('@reduxjs/toolkit');
const { createApi, fetchBaseQuery } = require('@reduxjs/toolkit/query');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

for (const scenario of ['estimate', 'manual', 'unavailable', 'recurring', 'free', 'recovered', 'recurring-recovered']) {
  test(`quote -> price choice -> ${scenario} publication uses the real mobile HTTP contracts`, async t => {
    const received = [], hooks = hookHarness();
    let publicationSuccess, createdSnapshot;
    const recurring = scenario.startsWith('recurring');
    const server = createServer(async (req, res) => {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : undefined;
      received.push({ url: req.url, method: req.method, body }); res.setHeader('Content-Type', 'application/json');
      if (req.url === '/trip-requests/vehicle-options') {
        res.statusCode = scenario === 'unavailable' ? 503 : 200;
        res.end(JSON.stringify({ currency: 'CDF', options: [{ vehicleType: 'car', availableForRequestedSeats: true,
          recommendedPricePerSeat: 2500, recommendedTotalPrice: 7500 }] }));
      } else if (['/trips', '/trips/recurring'].includes(req.url)) {
        createdSnapshot = { id: 'synthetic-trip', createdAt: new Date().toISOString(),
          departure: { name: body.departureLocation }, arrival: { name: body.arrivalLocation },
          departureTime: body.departureDate, vehicleId: body.vehicleId };
        // Simulate a committed write whose response was lost, not another POST.
        if (scenario.endsWith('recovered')) { req.socket.destroy(); return; }
        res.end(JSON.stringify({ id: 'synthetic-trip', ...body }));
      } else if (['/trips/my-trips', '/trips/recurring/my'].includes(req.url)) {
        res.end(JSON.stringify([createdSnapshot]));
      } else { res.statusCode = 404; res.end('{}'); }
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const http = fetchBaseQuery({ baseUrl: `http://127.0.0.1:${server.address().port}`, timeout: 2000 });
    const api = createApi({ reducerPath: 'publishTest', tagTypes: ['Trip', 'MyTrips', 'RecurringTrip'],
      baseQuery: (args, context, extra) => http({ ...args, timeout: 2000 }, context, extra), endpoints: () => ({}) });
    let quote = {}, quoteError = false, store;
    t.after(async () => {
      hooks.unmount(); store?.dispatch(api.util.resetApiState());
      server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
    });
    const load = loader({ react: hooks.react, './baseApi': { baseApi: api },
      './tripApi': {}, './tripMapper': { mapServerTripToClient: v => v, mapServerRecurringTripToClient: v => v },
      'react-native': { Platform: { OS: 'android' } }, 'react-native-maps': {}, '@react-native-community/datetimepicker': {},
      '@/hooks/useDisplayReads': { useDisplayReadsEnabled: enabled => enabled },
      '@/hooks/trip-request/useRequestVehicleOptions': { useRequestVehicleOptions: () => ({ vehicleOptions: quote.options ?? [],
        isPriceLoading: false, isVehicleOptionsError: quoteError, retryVehicleOptions() {} }) },
      '@/services/sharedRouteAddresses': { resolveSharedRouteAddresses: async () => ({ departureAddress: 'Départ fictif', arrivalAddress: 'Arrivée fictive' }) },
      '@/services/tokenSession': { getTokenSessionVersion: () => 0 },
      '@/services/analytics': { trackEvent() {} }, '@/services/driverPermissionOnboarding': { recordDriverPublication() {} },
    });
    load('store/api/tripRequestApi.ts');
    const endpoints = load('store/api/trip/getTrips.endpoints.ts').buildGetTripsEndpoints;
    api.injectEndpoints({ endpoints: builder => {
      const definitions = endpoints(builder); return { createTrip: definitions.createTrip, createRecurringTrip: definitions.createRecurringTrip,
        getMyTrips: definitions.getMyTrips, getMyRecurringTrips: definitions.getMyRecurringTrips };
    } });
    store = configureStore({ reducer: { [api.reducerPath]: api.reducer }, middleware: d => d().concat(api.middleware) });
    const send = (name, body) => store.dispatch(api.endpoints[name].initiate(body));
    const args = { departureLocation: 'Départ fictif', arrivalLocation: 'Arrivée fictive', numberOfSeats: 3,
      departureCoordinates: [15.29, -4.31], arrivalCoordinates: [15.32, -4.3] };
    try { quote = await send('tripRequestVehicleOptions', args).unwrap(); } catch { quoteError = true; }
    assert.deepEqual(received[0].body, args);
    const usePrice = load('hooks/publish/usePublishPriceEstimate.ts').usePublishPriceEstimate;
    const useSubmission = load('hooks/publish/usePublishSubmission.ts').usePublishSubmission;
    const props = { enabled: true, vehicleType: 'car', price: '', hasEditedPrice: false,
      setPrice: value => { props.price = value; }, setHasEditedPrice: value => { props.hasEditedPrice = value; } };
    const submission = { publishInFlightRef: { current: false }, hasDepartureAddress: true, hasArrivalAddress: true,
      seats: '3', departureDateTime: new Date('2030-01-01T12:00:00Z'), isDriver: true, selectedVehicleId: 'synthetic-car',
      isPublishIdentityVerified: true, isRecurringTrip: recurring, recurringWeekdays: [1, 3],
      departureAddress: 'Départ fictif', arrivalAddress: 'Arrivée fictive', departureReference: '', arrivalReference: '', description: '',
      acceptedPaymentModes: ['points'], isFreeTrip: scenario === 'free',
      formatDateOnlyValue: () => '2030-01-01', formatTimeOnlyValue: () => '12:00',
      createTrip: body => send('createTrip', body), createRecurringTrip: body => send('createRecurringTrip', body),
      getMyTrips: () => send('getMyTrips'), getMyRecurringTrips: () => send('getMyRecurringTrips'),
      setPublicationSuccess(value) { publicationSuccess = value; }, showDialog: () => assert.fail('unexpected validation error') };
    const render = () => hooks.render(() => {
      const pricing = usePrice(props); return { pricing, submission: useSubmission({ ...submission, price: pricing.price }) };
    });
    assert.equal(render().pricing.price, scenario === 'unavailable' ? '' : '2500');
    if (['manual', 'unavailable'].includes(scenario)) render().pricing.setPrice('3000');
    const current = render(); await Promise.all([current.submission.handlePublish(), current.submission.handlePublish()]);
    const posts = received.filter(item => item.url.startsWith('/trips') && item.method === 'POST');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].url, recurring ? '/trips/recurring' : '/trips');
    assert.equal(posts[0].body.pricePerSeat, scenario === 'free' ? 0 : ['manual', 'unavailable'].includes(scenario) ? 3000 : 2500);
    assert.equal(posts[0].body.totalSeats, 3);
    assert.deepEqual(posts[0].body.acceptedPaymentModes, scenario === 'free' ? undefined : ['points']);
    assert.deepEqual(publicationSuccess, { recurring, id: 'synthetic-trip' });
    if (scenario.endsWith('recovered')) assert.equal(received.filter(item => item.method === 'GET').length, 1);
  });
}
