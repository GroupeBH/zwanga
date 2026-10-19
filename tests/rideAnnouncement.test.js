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
    spoken: [], pauses: 0, resumes: 0, stops: 0, loads: 0,
    voices: async () => [{ language: 'fr-FR', identifier: 'french' }] };
  const speech = { getAvailableVoicesAsync: () => { io.loads++; return io.voices(); },
    isSpeakingAsync: async () => io.busy,
    speak: (text, options) => io.spoken.push({ text, options }), stop: async () => { io.stops++; } };
  const load = loader({ 'expo-device': { get isDevice() { return io.device; } },
    'react-native': { Platform: { OS: 'android' } }, 'expo-speech': speech,
    './appActivity': { isAppActive: () => io.active },
    './foregroundRideSound': { isForegroundRideSoundReady: () => io.ready,
      pauseForegroundRideSoundForSpeech: () => { io.pauses++; return () => { io.resumes++; }; } },
    './tokenSession': { getTokenSessionVersion: () => io.version },
    './rideAlertSession': { pendingRideAlerts: user => io.pending.filter(item => item.recipientId === user) },
  });
  const service = load('services/foregroundRideAnnouncement.ts');
  return { io, load, ...service, run: () => service.reconcileRideAnnouncement(userId),
    advance: async (ms = 2001) => { t.mock.timers.tick(ms); await tick(); } };
}

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
