// Read-only local runtime inspection. Credentials and user identity never leave Hermes.
const { inspect, evaluate, findModule } = require('./mobile-runtime-probe.cjs');
(async () => {
  const runtime = await inspect();
  if (!runtime.development || !runtime.localApi || !runtime.authenticated)
    throw Error('Authenticated local development runtime required');
  const result = await evaluate(`(() => {
    const state = ${findModule('store/index.ts')}.store.getState();
    const booking = value => value && ({
      id: value.id, tripId: value.tripId, status: value.status,
      ownPassenger: value.passengerId === state.auth.user.id,
      pickedUp: value.pickedUp, pickedUpAt: value.pickedUpAt,
      paymentMode: value.paymentMode, paymentStatus: value.paymentStatus,
      droppedOff: value.droppedOff, droppedOffAt: value.droppedOffAt,
      pickupDetectionMethod: value.pickupDetectionMethod, dropoffDetectionMethod: value.dropoffDetectionMethod,
      updatedAt: value.updatedAt, tripStatus: value.trip?.status, fromRequest: !!value.trip?.tripRequestId,
    });
    const snapshot = value => value && ({
      version: value.version, confirmationMode: value.confirmationMode, tripStatus: value.tripStatus,
      bookingStatus: value.bookingStatus, bookingId: value.bookingId,
      pickup: value.pickup, dropoff: value.dropoff,
    });
    return {
      online: state.zwangaApi.config.online, focused: state.zwangaApi.config.focused,
      progressLoaded: !!${findModule('components/PassengerRideProgressCoordinator.tsx')},
      outbox: { hydrated: state.rideRecovery.hydrated, ownAccount: state.rideRecovery.userId === state.auth.user.id,
        error: !!state.rideRecovery.error,
        receipts: (state.rideRecovery.userId === state.auth.user.id ? state.rideRecovery.entries : [])
          .map(entry => ({ bookingId: entry.bookingId, stage: entry.stage, state: entry.state, attempts: entry.attempts, occurredAt: entry.occurredAt })),
        blocked: (state.rideRecovery.userId === state.auth.user.id ? state.rideRecovery.entries : [])
          .filter(entry => entry.state === 'blocked').map(entry => ({ bookingId: entry.bookingId, tripId: entry.tripId,
            stage: entry.stage, decision: entry.decision, attempts: entry.attempts, occurredAt: entry.occurredAt, message: entry.message })),
        counts: (state.rideRecovery.userId === state.auth.user.id ? state.rideRecovery.entries : [])
          .reduce((counts, entry) => { counts[entry.state] = (counts[entry.state] || 0) + 1; return counts; }, {}) },
      rows: Object.values(state.zwangaApi.queries).filter(q => /Booking|RideDeclaration/.test(q.endpointName)).map(q => ({
        endpoint: q.endpointName, status: q.status, fulfilled: q.fulfilledTimeStamp,
        data: q.endpointName.includes('Booking') ? (Array.isArray(q.data) ? q.data.filter(b => b.trip?.status === 'ongoing').map(booking) : booking(q.data)) : (Array.isArray(q.data) ? q.data.map(snapshot) : snapshot(q.data)),
      })),
    };
  })()`);
  console.log(JSON.stringify(result));
  if (process.argv.includes('--refresh')) {
    const started = await evaluate(`(() => { let step = 'state'; try {
      const state = ${findModule('store/index.ts')}.store.getState();
      step = 'env';
      const env = ${findModule('config/env.ts')}.envConfig;
      step = 'query';
      const candidates = Object.values(state.zwangaApi.queries)
        .filter(q => ['getBookingById', 'getTripBookings', 'getMyActivityBookings'].includes(q.endpointName))
        .sort((a, b) => (b.fulfilledTimeStamp || 0) - (a.fulfilledTimeStamp || 0))
        .flatMap(q => Array.isArray(q.data) ? q.data : q.data ? [q.data] : []);
      const booking = candidates.find(b => b.trip?.status === 'ongoing' &&
        (b.passengerId === state.auth.user.id || b.trip?.driverId === state.auth.user.id));
      if (!booking) throw Error('No participant booking for ongoing trip in runtime');
      globalThis.__zwangaProgressAudit = null;
      Promise.all(['bookings/' + booking.id, 'ride-declarations/booking/' + booking.id].map(path => {
        const base = env.apiUrl.endsWith('/') ? env.apiUrl.slice(0, -1) : env.apiUrl;
        return fetch(base + '/' + path, { method: 'GET', redirect: 'error', headers: { Authorization: 'Bearer ' + state.auth.accessToken } }).then(r => r.json().then(d => ({ endpoint: path.split('/')[0], status: r.status, bookingStatus: d.status,
          pickedUp: d.pickedUp, droppedOff: d.droppedOff, updatedAt: d.updatedAt,
          confirmationMode: d.confirmationMode, pickup: d.pickup, dropoff: d.dropoff })));
      })).then(rows => { globalThis.__zwangaProgressAudit = rows; }).catch(() => { globalThis.__zwangaProgressAudit = { failed: true }; });
      return { started: true };
    } catch (error) { return { started: false, step, name: error.name }; }
    })()`);
    if (!started?.started) throw Error('Read-only probe failed at ' + started?.step + ': ' + started?.name);
    let refreshed;
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      refreshed = await evaluate('globalThis.__zwangaProgressAudit');
      if (refreshed) break;
    }
    await evaluate('delete globalThis.__zwangaProgressAudit');
    console.log(JSON.stringify({ freshHttp: refreshed }));
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
