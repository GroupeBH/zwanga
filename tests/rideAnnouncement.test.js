const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
const userId = 'driver';
const alert = (id = 'one', kind = 'booking', data = {}) => ({ key: `driver-${kind}-${id}`, id, kind, recipientId: userId, data });

test('short French description uses structured route/seats/schedule only, with a generic legacy fallback', () => {
  const { buildRideAnnouncement: build } = loader()('features/notifications/rideAnnouncement.ts');
  const data = { rideSpeechVersion: '1', rideDeparture: ' Place centrale ', rideArrival: 'Gare', rideSeats: '2',
    rideDepartureAt: '2026-10-21T09:00:00Z', invitationText: 'Never speak this', passengerName: 'Never speak this' };
  for (const kind of ['booking', 'dispatch', 'nearby']) {
    const text = build(alert('one', kind, data));
    assert.match(text, /Départ : Place centrale\. Arrivée : Gare\. 2 places demandées/);
    assert.match(text, /21 octobre à 10 heures 00/);
    assert.ok(!text.includes('Never speak this'));
  }
  assert.equal(build(alert('one', 'response', data)), null);
  assert.equal(build(alert()), 'Nouvelle réservation sur votre trajet. Acceptez ou refusez dans l’application.');
  assert.match(build(alert('one', 'nearby')), /Ouvrez la commande pour répondre/);
  assert.match(build(alert('one', 'booking', { ...data, rideSeats: '1' })), /1 place demandée/);
});

test('labels, dates, seats and unknown payload versions cannot create unbounded or misleading speech', () => {
  const { buildRideAnnouncement: build } = loader()('features/notifications/rideAnnouncement.ts');
  const text = build(alert('one', 'booking', { rideSpeechVersion: '1', rideDeparture: 'Ma position actuelle',
    rideArrival: '<b>Gare</b>\n' + 'a'.repeat(3000), rideSeats: '10000', rideDepartureAt: 'invalid' }));
  assert.match(text, /point indiqué par le passager/);
  assert.ok(text.length < 260); assert.ok(!text.includes('<b>')); assert.ok(!text.includes('10000'));
  assert.ok(!text.includes('Prévu le')); assert.ok(!text.includes('invalid'));
  assert.equal(build(alert('one', 'booking', { rideSpeechVersion: 'future', rideDeparture: 'Do not read' })), build(alert()));
});

function fixture(t) {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 100000 });
  const io = { active: true, ready: true, device: true, version: 0, busy: false, pending: [alert()],
    spoken: [], pauses: 0, resumes: 0, stops: 0, loads: 0, allowed: true,
    voices: async () => [{ language: 'fr-FR', identifier: 'french' }] };
  const speech = { getAvailableVoicesAsync: () => { io.loads++; return io.voices(); },
    isSpeakingAsync: async () => io.busy,
    speak: (text, options) => io.spoken.push({ text, options }), stop: async () => { io.stops++; } };
  const load = loader({ 'expo-device': { get isDevice() { return io.device; } },
    'react-native': { Platform: { OS: 'android' } }, 'expo-speech': speech,
    './appActivity': { isAppActive: () => io.active },
    './foregroundRideSound': { isForegroundRideSoundReady: () => io.ready,
      canPlayForegroundRideAudio: async () => io.allowed,
      pauseForegroundRideSoundForSpeech: () => { io.pauses++; return () => { io.resumes++; }; } },
    './tokenSession': { getTokenSessionVersion: () => io.version },
    './rideAlertSession': { pendingRideAlerts: user => io.pending.filter(item => item.recipientId === user) },
  });
  const service = load('services/foregroundRideAnnouncement.ts');
  return { io, load, ...service, run: () => service.reconcileRideAnnouncement(userId),
    advance: async (ms = 2001) => { t.mock.timers.tick(ms); await tick(); } };
}

test('payment overlays use the existing voice after entry, only once, and stop when dismissed', async t => {
  const f = fixture(t); f.io.pending = []; f.io.ready = false; f.io.allowed = false;
  const source = f.load('services/paymentSpeechSource.ts');
  const token = {}, message = { key: 'payment:passenger:one:paid:800:CDF', text: 'Paiement de 800 francs congolais confirmé.' };
  source.publishPaymentSpeech(token, userId, 0, message);
  f.run(); await tick();
  assert.equal(f.io.spoken.length, 1); assert.equal(f.io.spoken[0].text, message.text);
  f.run(); assert.equal(f.io.spoken.length, 1);
  source.removePaymentSpeech(token); f.run(); await tick();
  assert.equal(f.io.stops, 1);
  source.publishPaymentSpeech(token, userId, 0, message);
  await f.advance(); f.run(); await tick();
  assert.equal(f.io.spoken.length, 1, 'returning to the same receipt does not repeat its voice');
  assert.equal(source.paymentSpeechPending(source.readPaymentSpeech(userId, 0)), false);
});

test('payment voice never leaks after background, dismissal, logout or navigation interruption', async t => {
  const f = fixture(t); f.io.pending = []; f.io.ready = false;
  const source = f.load('services/paymentSpeechSource.ts'), token = {};
  let resolveVoice;
  f.io.voices = () => new Promise(resolve => { resolveVoice = resolve; });
  source.publishPaymentSpeech(token, userId, 0, { key: 'payment:one', text: 'Montant à régler.' });
  f.run(); await tick();
  f.io.active = false; f.run();
  resolveVoice([{ language: 'fr-FR', identifier: 'french' }]); await tick();
  assert.equal(f.io.spoken.length, 0);
  f.io.active = true; await f.advance(); f.run(); await tick();
  assert.equal(f.io.spoken.length, 1);
  const priority = f.load('services/navigationSpeechPriority.ts');
  await priority.interruptRideSpeechForNavigation();
  assert.equal(f.io.stops, 1);
  source.removePaymentSpeech(token); f.run(); await tick();
  assert.equal(f.io.stops, 1, 'a later close cannot stop a GPS instruction');
  f.io.version++; source.publishPaymentSpeech(token, userId, 0, { key: 'payment:stale', text: 'Must not read.' });
  await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 1);
});

test('wallet uses shared audio, stays below payment overlays even after refetch, and has a bounded reading time', async t => {
  const f = fixture(t); f.io.pending = []; f.io.ready = false; f.io.allowed = false;
  const source = f.load('services/paymentSpeechSource.ts'), wallet = {}, overlay = {};
  const message = { key: 'wallet:one', text: 'Vous avez 100 jetons.' };
  source.publishPaymentSpeech(wallet, userId, 0, message, 'wallet');
  f.run(); await tick(); assert.equal(f.io.spoken[0].text, message.text);
  source.publishPaymentSpeech(overlay, userId, 0, { key: 'payment:one', text: 'Paiement confirmé.' });
  f.run(); await tick(); assert.equal(f.io.stops, 1);
  source.publishPaymentSpeech(wallet, userId, 0, { key: 'wallet:two', text: 'Vous avez 200 jetons.' }, 'wallet');
  await f.advance(); f.run(); await tick();
  assert.equal(f.io.spoken.at(-1).text, 'Paiement confirmé.');
  f.io.spoken.at(-1).options.onDone(); await f.advance(); f.run(); await tick();
  assert.equal(f.io.spoken.length, 2, 'underlying screen cannot talk over a visible receipt');
  source.removePaymentSpeech(overlay); f.run(); await tick();
  assert.equal(f.io.spoken.at(-1).text, 'Vous avez 200 jetons.');
  await f.advance(25001); assert.equal(f.io.stops, 1, 'wallet explanation may need more than 25 seconds');
  await f.advance(20000); assert.equal(f.io.stops, 2, 'missing native completion is bounded at 45 seconds');
  f.run(); await tick(); assert.equal(f.io.spoken.length, 3);
});

test('a driver opportunity interrupts wallet speech without being hidden by the balance screen', async t => {
  const f = fixture(t); f.io.pending = [];
  const source = f.load('services/paymentSpeechSource.ts');
  source.publishPaymentSpeech({}, userId, 0, { key: 'wallet:one', text: 'Votre solde.' }, 'wallet');
  f.run(); await tick(); assert.equal(f.io.spoken[0].text, 'Votre solde.');
  f.io.pending = [alert('urgent')]; f.run(); await tick(); assert.equal(f.io.stops, 1);
  await f.advance(); f.run(); await tick();
  assert.match(f.io.spoken.at(-1).text, /Nouvelle réservation/);
  f.run(); await tick(); assert.equal(f.io.stops, 1, 'wallet cannot cut the opportunity summary');
});

test('wallet speech yields to GPS and never continues in the background or another account', async t => {
  const f = fixture(t); f.io.pending = []; f.io.ready = false;
  const source = f.load('services/paymentSpeechSource.ts'), token = {};
  source.publishPaymentSpeech(token, userId, 0, { key: 'wallet:one', text: 'Votre solde.' }, 'wallet');
  f.run(); await tick();
  await f.load('services/navigationSpeechPriority.ts').interruptRideSpeechForNavigation();
  assert.equal(f.io.stops, 1);
  source.publishPaymentSpeech(token, userId, 0, { key: 'wallet:two', text: 'Nouveau solde.' }, 'wallet');
  await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 2);
  f.io.active = false; f.run(); await tick(); assert.equal(f.io.stops, 2);
  f.io.active = true; f.io.version++; await f.advance(); f.run(); await tick();
  assert.equal(f.io.spoken.length, 2);
});

test('busy GPS speech keeps payment unqueued and its retry window expires', async t => {
  const f = fixture(t); f.io.pending = []; f.io.busy = true;
  const source = f.load('services/paymentSpeechSource.ts');
  source.publishPaymentSpeech({}, userId, 0, { key: 'payment:busy', text: 'Montant à régler.' });
  f.run(); await tick(); assert.equal(f.io.spoken.length, 0);
  await f.advance(30001); f.io.busy = false; f.run(); await tick();
  assert.equal(f.io.spoken.length, 0);
  assert.equal(source.paymentSpeechPending(source.readPaymentSpeech(userId, 0)), false);
});

test('one announcement per alert, one voice at a time, with ringtone pause/resume and no passenger response speech', async t => {
  const f = fixture(t);
  f.io.pending.push(alert('two', 'dispatch'), alert('response', 'response'));
  f.run(); f.run(); await tick();
  assert.equal(f.io.spoken.length, 1); assert.equal(f.io.pauses, 1);
  assert.equal(f.io.spoken[0].options.voice, 'french');
  f.run(); assert.equal(f.io.spoken.length, 1);
  f.io.spoken[0].options.onDone(); assert.equal(f.io.resumes, 1);
  await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 2);
  f.io.spoken[1].options.onDone(); await f.advance(); f.run(); await tick();
  assert.equal(f.io.spoken.length, 2); assert.equal(f.io.loads, 1);
  f.io.active = false; f.stopRideAnnouncement(); f.io.active = true;
  await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 2);
});

test('no speech engine is initialized while backgrounded, muted, on simulator, or for another account', async t => {
  const f = fixture(t);
  f.io.active = false; f.run(); await tick();
  f.io.active = true; f.io.ready = false; f.run(); await tick();
  f.io.ready = true; f.io.device = false; f.run(); await tick();
  f.io.device = true; f.reconcileRideAnnouncement('other'); await tick();
  assert.equal(f.io.loads, 0); assert.equal(f.io.spoken.length, 0);
  f.run(); await tick(); assert.equal(f.io.spoken.length, 1);
  f.clearRideAnnouncementSession(); await tick();
});

test('background cancels only the active ride announcement and never replays it on reopening', async t => {
  const f = fixture(t); f.run(); await tick();
  f.io.active = false; f.stopRideAnnouncement(); await tick();
  assert.equal(f.io.stops, 1); assert.equal(f.io.resumes, 1);
  f.stopRideAnnouncement(); assert.equal(f.io.stops, 1);
  f.io.active = true; await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 1);
});

test('background during TTS initialization cannot leave delayed native speech to play on the lock screen', async t => {
  const f = fixture(t); let finish;
  f.io.voices = () => new Promise(resolve => { finish = resolve; });
  f.run(); await tick(); f.io.active = false; f.stopRideAnnouncement();
  finish([{ language: 'fr-FR', identifier: 'french' }]); await tick();
  assert.equal(f.io.spoken.length, 0); assert.equal(f.io.stops, 0);
  f.io.active = true; await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 1);
  f.clearRideAnnouncementSession(); await tick();
});

test('acknowledgement or expiry cancels speech without silencing another pending ride', async t => {
  const f = fixture(t); f.run(); await tick();
  f.io.pending = [alert('two', 'nearby')]; f.run(); await tick();
  assert.equal(f.io.stops, 1);
  await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 2);
  // A late callback from the first voice cannot release the new voice or resume its sound.
  f.io.spoken[0].options.onStopped(); assert.equal(f.io.resumes, 1);
  f.io.spoken[1].options.onDone(); assert.equal(f.io.resumes, 2);
});

test('busy navigation is never flushed; its next instruction preempts the alert and remains allowed in background', async t => {
  const f = fixture(t); f.io.busy = true; f.run(); await tick();
  assert.equal(f.io.spoken.length, 0); assert.equal(f.io.stops, 0);
  f.io.busy = false; await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 1);
  const { NavigationSpeech } = f.load('utils/navigationSpeech.ts');
  NavigationSpeech.speak('Tournez à droite.'); await tick();
  assert.equal(f.io.stops, 1); assert.equal(f.io.spoken.at(-1).text, 'Tournez à droite.');
  f.io.active = false; f.stopRideAnnouncement(); await tick();
  assert.equal(f.io.stops, 1, 'must not stop the navigation voice after handing over ownership');
  NavigationSpeech.speak('Continuez tout droit.');
  assert.equal(f.io.spoken.at(-1).text, 'Continuez tout droit.');
});

test('a newer navigation instruction wins over a pending interruption; explicit navigation stop still works', async t => {
  const f = fixture(t); f.run(); await tick();
  const { NavigationSpeech } = f.load('utils/navigationSpeech.ts');
  NavigationSpeech.speak('Ancienne instruction.'); NavigationSpeech.speak('Nouvelle instruction.'); await tick();
  assert.ok(!f.io.spoken.some(item => item.text === 'Ancienne instruction.'));
  assert.equal(f.io.spoken.at(-1).text, 'Nouvelle instruction.');
  await NavigationSpeech.stop(); assert.equal(f.io.stops, 2);
});

test('navigation stop still stops GPS if a foreground announcement has not yet acquired the voice engine', async t => {
  const f = fixture(t); let finish;
  f.io.voices = () => new Promise(resolve => { finish = resolve; });
  f.run(); await tick();
  await f.load('utils/navigationSpeech.ts').NavigationSpeech.stop();
  assert.equal(f.io.stops, 1);
  finish([{ language: 'fr-FR', identifier: 'french' }]); await tick();
  assert.equal(f.io.spoken.length, 0);
});

test('engine failures and missing French voices fall back to the ringtone without repeated attempts', async t => {
  const f = fixture(t); f.io.voices = async () => { throw new Error('engine unavailable'); };
  f.run(); await tick(); await f.advance(); f.run(); await tick();
  assert.equal(f.io.spoken.length, 0); assert.equal(f.io.loads, 1); assert.equal(f.io.pauses, 0);
});

test('temporary TTS failure is retried after backoff and never poisons future entry sessions', async t => {
  const f = fixture(t); f.io.voices = async () => { throw Error('temporary'); };
  f.run(); await tick(); assert.equal(f.io.loads, 1);
  f.io.voices = async () => [{ language: 'fr-FR', identifier: 'recovered' }];
  await f.advance(5001); f.run(); await tick();
  assert.equal(f.io.loads, 2); assert.equal(f.io.spoken.length, 1);
  assert.equal(f.io.spoken[0].options.voice, 'recovered'); f.clearRideAnnouncementSession();
});

test('entry timeout suppresses its old backlog but allows newly received foreground alerts', async t => {
  const f = fixture(t); const { registry, source, token } = entry(f);
  registry.publishRideEntrySource(token, { ...source, ready: false });
  f.run(); await tick(); await f.advance(31000); f.run(); await tick();
  assert.equal(f.io.spoken.length, 0);
  f.io.pending.push(alert('fresh-after-timeout')); f.run(); await tick();
  assert.equal(f.io.spoken.length, 1); f.clearRideAnnouncementSession();
});

test('refetching unchanged priority does not cut the sentence, but a real decision does', async t => {
  const f = fixture(t); const { registry, source, token } = entry(f);
  await f.advance(); f.run(); await tick();
  registry.publishRideEntrySource(token, { ...source, ready: false }); f.run(); await tick();
  assert.equal(f.io.stops, 0);
  registry.publishRideEntrySource(token, { ...source, ready: true }); f.run(); await tick();
  assert.equal(f.io.spoken.length, 1);
  registry.publishRideEntrySource(token, { ...source, message: null }); f.run(); await tick();
  assert.equal(f.io.stops, 1);
});

test('GPS owns the ringtone pause until completion even when entry cleanup releases its lease', async t => {
  const f = fixture(t);
  const focus = f.load('services/rideAudioFocus.ts');
  const { NavigationSpeech } = f.load('utils/navigationSpeech.ts');
  f.run(); await tick(); NavigationSpeech.speak('Tournez à droite.'); await tick();
  assert.equal(focus.isRideAudioHeld(), true);
  f.io.spoken.at(-1).options.onDone(); assert.equal(focus.isRideAudioHeld(), false);
  NavigationSpeech.speak('Continuez.'); await NavigationSpeech.stop();
  assert.equal(focus.isRideAudioHeld(), false);
});

test('notification detail entry waits for verified screen data and describes it once', async t => {
  const f = fixture(t); const path = '/request-details/request';
  const { registry, token, source } = entry(f, path, 'Un client cherche un véhicule. Acceptez sa commande.');
  registry.publishRideEntrySource(token, { ...source, ready: false });
  await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 0);
  registry.publishRideEntrySource(token, source); await f.advance(); f.run(); await tick();
  assert.equal(f.io.spoken.length, 1); assert.match(f.io.spoken[0].text, /Acceptez sa commande/);
  f.clearRideAnnouncementSession();
});

test('does not read French route descriptions using an unrelated fallback voice', async t => {
  const f = fixture(t); f.io.voices = async () => [{ language: 'en-US', identifier: 'english' }];
  f.run(); await tick(); assert.equal(f.io.spoken.length, 0); assert.equal(f.io.pauses, 0);
});

test('error and missing speech completion callbacks restore the ringtone, with a bounded watchdog', async t => {
  const f = fixture(t); f.run(); await tick();
  f.io.spoken[0].options.onError(new Error('synthetic')); assert.equal(f.io.resumes, 1);
  f.io.pending = [alert('two')]; await f.advance(); f.run(); await tick();
  await f.advance(25001); assert.equal(f.io.stops, 1); assert.equal(f.io.resumes, 2);
  f.run(); await tick(); assert.equal(f.io.spoken.length, 2);
});

test('changing account/session or logging out prevents late speech and releases the current utterance', async t => {
  const f = fixture(t); let finish;
  f.io.voices = () => new Promise(resolve => { finish = resolve; });
  f.run(); await tick(); f.io.version++; f.clearRideAnnouncementSession();
  finish([{ language: 'fr-FR', identifier: 'french' }]); await tick(); assert.equal(f.io.spoken.length, 0);
  f.run(); await tick(); assert.equal(f.io.spoken.length, 1);
  f.reconcileRideAnnouncement('other'); await tick(); assert.equal(f.io.stops, 1);
});

function entry(f, path = '/', text = 'Une réservation vous attend. Acceptez ou refusez.') {
  const registry = f.load('services/rideEntryAnnouncement.ts');
  const token = {};
  registry.beginRideSpeechEntry(userId);
  registry.setRideSpeechEntryGate({ userId, path, blocked: false });
  const source = { userId, path, ready: true, message: { key: 'priority', text } };
  registry.publishRideEntrySource(token, source);
  return { registry, source, token };
}

test('entry waits for role/ride resolution, speaks one screen priority without a push, and does not drain the backlog', async t => {
  const f = fixture(t); f.io.ready = false;
  const { registry } = entry(f);
  registry.setRideSpeechEntryGate({ userId, path: '/', blocked: true });
  await f.advance(); f.run(); await tick(); assert.equal(f.io.loads, 0);
  registry.setRideSpeechEntryGate({ userId, path: '/', blocked: false });
  f.run(); await tick(); assert.equal(f.io.loads, 0, 'allow the screen selection to settle');
  await f.advance(); f.run(); await tick();
  assert.equal(f.io.spoken.length, 1); assert.match(f.io.spoken[0].text, /Une réservation vous attend/);
  f.io.spoken[0].options.onDone(); f.io.ready = true;
  await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 1);
  f.io.pending.push(alert('fresh')); f.run(); await tick(); assert.equal(f.io.spoken.length, 2, 'new foreground events remain supported');
});

test('a verified navigation screen wins over Home and pending nearby pushes, using the role in the ride', async t => {
  const f = fixture(t); f.io.pending = [alert('nearby', 'nearby')];
  const { registry } = entry(f);
  const path = '/booking/navigate/booking';
  registry.setRideSpeechEntryGate({ userId, path, blocked: false });
  registry.publishRideEntrySource({}, { userId, path, ready: true,
    message: { key: 'passenger', text: 'Votre conducteur vous attend. Retrouvez-le au point de départ.' } });
  await f.advance(); f.run(); await tick();
  assert.match(f.io.spoken[0].text, /Votre conducteur/); assert.equal(f.io.spoken.length, 1);
  f.io.spoken[0].options.onDone(); f.io.pending.push(alert('late'));
  await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 1);
});

test('entry is silent with denied audio, no event, unresolved data or an expired resolution window', async t => {
  const f = fixture(t); const { registry, source, token } = entry(f);
  registry.publishRideEntrySource(token, { ...source, ready: false });
  await f.advance(); f.run(); await tick(); assert.equal(f.io.loads, 0);
  await f.advance(30001); f.run(); await tick(); assert.equal(f.io.loads, 0);
  registry.beginRideSpeechEntry(userId); registry.publishRideEntrySource(token, { ...source, message: null });
  await f.advance(); f.run(); await tick(); assert.equal(f.io.loads, 0);
  registry.beginRideSpeechEntry(userId); registry.publishRideEntrySource(token, source); f.io.allowed = false;
  await f.advance(); f.run(); await tick(); assert.equal(f.io.loads, 0);
  assert.equal(registry.hasPendingRideSpeechEntry(userId), false);
});

test('late engine initialization cannot speak an old priority or cross an account change', async t => {
  const f = fixture(t); const { registry, source, token } = entry(f); let finish;
  f.io.voices = () => new Promise(resolve => { finish = resolve; });
  await f.advance(); f.run(); await tick();
  registry.publishRideEntrySource(token, { ...source, message: { key: 'new', text: 'La réservation a changé.' } });
  finish([{ language: 'fr-FR', identifier: 'french' }]); await tick(); assert.equal(f.io.spoken.length, 0);
  await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.at(-1).text, 'La réservation a changé.');
  registry.beginRideSpeechEntry('other'); f.run(); await tick(); assert.equal(f.io.stops, 1);
});

test('entry voice stops in background, a real new entry can describe it again, and GPS can interrupt it', async t => {
  const f = fixture(t); f.io.pending = [];
  const { registry } = entry(f); await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 1);
  f.io.active = false; f.stopRideAnnouncement(); await tick(); assert.equal(f.io.stops, 1);
  f.io.active = true; registry.beginRideSpeechEntry(userId);
  await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 2);
  f.load('utils/navigationSpeech.ts').NavigationSpeech.speak('Tournez à droite.'); await tick();
  assert.equal(f.io.stops, 2); assert.equal(f.io.spoken.at(-1).text, 'Tournez à droite.');
  assert.equal(f.io.spoken.at(-1).options.useApplicationAudioSession, true, 'restore GPS audio session after standalone entry voice');
  f.io.active = false; f.stopRideAnnouncement(); assert.equal(f.io.stops, 2);
});

test('restored notifications never trigger a second FIFO announcement after the entry priority', async t => {
  const f = fixture(t); f.io.pending = []; entry(f);
  await f.advance(); f.run(); await tick(); f.io.spoken[0].options.onDone();
  f.io.pending.push(alert('restored')); f.silenceRestoredRideAnnouncement('driver-booking-restored');
  await f.advance(); f.run(); await tick(); assert.equal(f.io.spoken.length, 1);
});
