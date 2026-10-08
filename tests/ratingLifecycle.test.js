const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

function fixture(t, os = 'ios') {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const hooks = hookHarness(), calls = [], pending = [], events = [], dialogs = [];
  const state = { active: true, userId: 'driver', tripId: 'trip', canGoBack: true };
  const router = { canGoBack: () => state.canGoBack, back: () => events.push('back'), replace: path => events.push(path) };
  const load = loader({
    react: hooks.react,
    'react-native': { Platform: { OS: os }, Keyboard: { dismiss: () => events.push('keyboard') } },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => state.active },
    'expo-router': { useLocalSearchParams: () => ({ id: state.tripId }), useRouter: () => router },
    '@/store/hooks': { useAppSelector: selector => selector({ auth: { user: { id: state.userId } } }) },
    '@/store/selectors': { selectUser: value => value.auth.user },
    '@/store/api/tripApi': { useGetTripByIdQuery: () => ({ data: {
      id: state.tripId, driverId: state.userId, status: 'completed', passengers: [],
    } }) },
    '@/store/api/bookingApi': {
      useGetTripBookingsQuery: () => ({ data: [{ id: 'booking', tripId: state.tripId, passengerId: 'passenger',
        status: 'completed', numberOfSeats: 2, passengerName: 'Passager test' }] }),
      useGetMyBookingsForTripQuery: () => ({}),
    },
    '@/components/ui/DialogProvider': { useDialog: () => ({ showDialog: value => dialogs.push(value) }) },
    '@/store/api/reviewApi': { useCreateReviewMutation: () => [payload => {
      calls.push(payload);
      const promise = new Promise((resolve, reject) => pending.push({ resolve, reject }));
      return { unwrap: () => promise };
    }, { isLoading: false }] },
  });
  const { useRatingData } = load('hooks/rating/useRatingData.ts');
  const { useRatingActions } = load('hooks/rating/useRatingActions.ts');
  const render = () => hooks.render(() => {
    const model = useRatingData();
    return { ...model, ...useRatingActions(model) };
  });
  const model = render(); model.setRating(5); model.setSelectedPassenger('passenger');
  t.after(() => hooks.unmount());
  return { hooks, state, calls, pending, events, dialogs, render };
}

for (const os of ['ios', 'android']) {
  test(`${os}: one review is sent, feedback stays inline, and successful navigation happens once`, async t => {
    const env = fixture(t, os);
    env.render().setComment('Très bien'); env.render().setSelectedTags(['punctual']);
    const task = env.render().handleSubmitRating();
    await env.render().handleSubmitRating();
    assert.equal(env.calls.length, 1);
    assert.deepEqual(env.calls[0], { tripId: 'trip', ratedUserId: 'passenger', rating: 5,
      comment: 'Très bien\n\nTags: #punctual' });
    env.pending[0].resolve({ id: 'review' }); await task;
    assert.match(env.render().submitSuccessMessage, /envoyée/);
    assert.deepEqual(env.dialogs, []);
    t.mock.timers.tick(650);
    env.render().goBackSafely(); t.mock.timers.tick(1000);
    assert.deepEqual(env.events, ['keyboard', 'back']);
    await env.render().handleSubmitRating(); assert.equal(env.calls.length, 1);
  });
}

test('a review saved while blurred is remembered without dismissing keyboards or navigating behind another screen', async t => {
  const env = fixture(t), task = env.render().handleSubmitRating();
  env.state.active = false; env.render();
  env.pending[0].resolve({ id: 'review' }); await task;
  t.mock.timers.tick(2000); assert.deepEqual(env.events, []); assert.deepEqual(env.dialogs, []);
  env.state.active = true;
  assert.match(env.render().submitSuccessMessage, /envoyée/);
  await env.render().handleSubmitRating(); assert.equal(env.calls.length, 1, 'do not replay a successful POST on return');
});

test('leaving and returning before the response cannot revive an old automatic return', async t => {
  const env = fixture(t), task = env.render().handleSubmitRating();
  env.state.active = false; env.render(); env.state.active = true; env.render();
  env.pending[0].resolve({ id: 'review' }); await task;
  t.mock.timers.tick(2000); assert.deepEqual(env.events, []);
  assert.match(env.render().submitSuccessMessage, /envoyée/);
});

test('blur cancels an already scheduled success return, even after refocusing', async t => {
  const env = fixture(t), task = env.render().handleSubmitRating();
  env.pending[0].resolve({}); await task;
  env.state.active = false; env.render(); env.state.active = true; env.render();
  t.mock.timers.tick(2000); assert.deepEqual(env.events, ['keyboard']);
});

test('manual close is single-flight and prevents a second return from a late response', async t => {
  const env = fixture(t), task = env.render().handleSubmitRating();
  env.render().goBackSafely(); env.render().goBackSafely();
  env.pending[0].resolve({}); await task; t.mock.timers.tick(2000);
  assert.deepEqual(env.events, ['back']);
});

test('errors after blur are silent, but another explicit attempt remains possible on return', async t => {
  const env = fixture(t), task = env.render().handleSubmitRating();
  env.state.active = false; env.render();
  env.pending[0].reject({ status: 'FETCH_ERROR' }); await task;
  assert.deepEqual(env.dialogs, []);
  env.state.active = true; const retry = env.render().handleSubmitRating();
  assert.equal(env.calls.length, 2);
  env.pending[1].reject({ status: 400, data: { message: 'Avis déjà envoyé.' } }); await retry;
  assert.equal(env.dialogs.length, 1); assert.equal(env.dialogs[0].variant, 'danger');
  assert.deepEqual(env.events, []);
});

test('another trip/account and unmount reject old feedback without unlocking a newer submission', async t => {
  const env = fixture(t), old = env.render().handleSubmitRating();
  env.state.userId = 'other-driver'; env.state.tripId = 'other-trip'; env.render();
  const next = env.render().handleSubmitRating();
  env.pending[0].reject({ status: 500 }); await old;
  assert.equal(env.render().submitInFlightRef.current, true);
  assert.deepEqual(env.dialogs, []); assert.equal(env.render().submitSuccessMessage, null);
  env.hooks.unmount(); env.pending[1].resolve({}); await next;
  t.mock.timers.tick(2000); assert.deepEqual(env.events, []);
});

test('inactive actions cannot submit, show validation dialogs or navigate; a deep link still returns Home', async t => {
  const env = fixture(t);
  env.state.active = false; const inactive = env.render();
  await inactive.handleSubmitRating(); inactive.handleSubmitReport(); inactive.goBackSafely();
  assert.deepEqual(env.calls, []); assert.deepEqual(env.dialogs, []); assert.deepEqual(env.events, []);
  env.state.active = true; env.state.canGoBack = false; env.render().goBackSafely();
  assert.deepEqual(env.events, ['/(tabs)']);
});

test('a report dialog action from before blur cannot close a newly focused screen', t => {
  const env = fixture(t);
  env.render().setReportReason('rude'); env.render().handleSubmitReport();
  const action = env.dialogs[0].actions[0].onPress;
  env.state.active = false; env.render(); env.state.active = true; env.render();
  action(); assert.deepEqual(env.events, []);
});
