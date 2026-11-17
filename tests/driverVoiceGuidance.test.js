const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('opening a passenger stop manually cannot announce arrival; GPS announcements remain available', async t => {
  const hooks = hookHarness(), spoken = [];
  t.after(() => hooks.unmount());
  const { useDriverVoiceGuidance } = loader({ react: hooks.react,
    '../../features/driver-navigation/navigationPresentation': { cleanHtmlInstructions: value => value, formatDistanceForSpeech: value => `${value} mètres` },
    'react-native': { Platform: { OS: 'android' } },
    '@/utils/navigationSpeech': { NavigationSpeech: { isSpeakingAsync: async () => false, stop: async () => {}, speak: text => spoken.push(text) } },
  })('hooks/driver-navigation/useDriverVoiceGuidance.ts');
  const waypoint = { id: 'dropoff', type: 'dropoff', passenger: { name: 'Passager fictif' }, address: 'Destination fictive' };
  const keys = new Set();
  const params = { isMountedRef: { current: true }, isTripOngoingRef: { current: true }, isVoiceGuidanceEnabledRef: { current: true },
    lastSpeechAtRef: { current: 0 }, waypointModalVisible: false, activeWaypoint: waypoint, announcedWaypointIdsRef: { current: keys },
    spokenInstructionKeysRef: { current: new Set() }, setIsVoiceGuidanceEnabled() {}, steps: [], currentStepIndex: 0,
    isTripOngoing: true, isLoadingRoute: false };
  hooks.render(() => useDriverVoiceGuidance(params));
  params.waypointModalVisible = true;
  const voice = hooks.render(() => useDriverVoiceGuidance(params));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(spoken, []); assert.equal(keys.size, 0);
  await voice.speakNavigationMessage(voice.buildWaypointSpeech(waypoint), { force: true });
  assert.equal(spoken.length, 1); assert.match(spoken[0], /destination de Passager fictif/);
});
