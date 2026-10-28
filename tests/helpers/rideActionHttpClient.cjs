const { loader } = require('./loadTypeScript.cjs');

/** Cross-repository test adapter. Real TS parsers, actions and endpoint definitions;
 * injected loopback HTTP replaces Redux transport, native storage and UI only. */
function rideActionHttpClient(userId, send) {
  const dismissed = [], feedback = [], requests = [];
  const session = { getTokenSessionVersion: () => 1 };
  const entry = { inviteAcceptedRequestContact: payload => ({ type: 'entry', payload }) };
  let definitions;
  const baseApi = { injectEndpoints({ endpoints }) {
    definitions = endpoints({ mutation: value => value, query: value => value });
    return { endpoints: Object.fromEntries(Object.entries(definitions).map(([name, value]) => [name, {
      initiate: args => ({ name, request: value.query(args) }),
    }])) };
  } };
  const load = loader({
    './baseApi': { baseApi },
    './trip-request/refusalCache': { hideRefusedRequest: id => ({ type: 'hide', id }) },
    '@/store/slices/rideEntrySlice': entry,
    '@/services/tokenSession': session, './tokenSession': session,
    './tokenStorage': { getTokens: async () => ({ accessToken:
      `test.${Buffer.from(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test` }) },
    './driverNotifications': { dismissDriverInvitation: async invitation => { dismissed.push(invitation); } },
    './rideAudioDiagnostics': { boundedRideAudio: promise => promise, reportRideAudioFailure() {} },
    'react-native': { Platform: { OS: 'android' } },
    '@notifee/react-native': { __esModule: true, default: {
      createChannel: async () => 'test', displayNotification: async data => { feedback.push(data); },
    }, AndroidImportance: { LOW: 2 }, AndroidVisibility: { PRIVATE: 0 } },
    '@/store': { store: { dispatch(action) {
      if (!action.request) return action;
      requests.push(action);
      const response = send(action.request, userId);
      return { unwrap: () => response, reset() {} };
    } } },
  });
  const api = load('store/api/driverDispatchApi.ts').driverDispatchApi;
  const parsers = load('features/notifications/driverInvitation.ts');
  const pending = load('features/notifications/pendingDriverOpen.ts');
  return {
    dismissed, feedback, requests,
    endpoint: (name, args) => send(api.endpoints[name].initiate(args).request, userId),
    async act(payload, action) {
      const data = parsers.readDriverPushData(payload);
      const invitation = parsers.parseDriverInvitation(data);
      if (invitation) await load('services/driverNotificationResponse.ts').respondToDriverNotification(invitation, action);
      else await load('services/nearbyNotificationAction.ts').handleNearbyNotificationAction(data, action);
      return pending.takePendingDriverOpen(userId);
    },
  };
}
module.exports = { rideActionHttpClient };
