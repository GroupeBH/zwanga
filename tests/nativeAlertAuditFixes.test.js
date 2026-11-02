const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const source = name => readFileSync(`native/android/notifications/${name}.java`, 'utf8');

// Source contracts complement the native compilation, not runtime device tests.
test('durable recovery is immediate, expedited on Android 12+, quota-safe and bounded', () => {
  const worker = source('RideDeliveryWorker');
  assert.match(worker, /SDK_INT >= 31.*setExpedited\(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST\)/);
  assert.doesNotMatch(worker, /setInitialDelay/);
  assert.match(worker, /ExistingWorkPolicy.KEEP/);
  assert.match(worker, /getRunAttemptCount\(\) >= 2/);
  assert.match(worker, /RideNotificationBundle.valid/);
});
test('a late Notifee completion cannot initialize a second audio publisher after a worker displayed it', () => {
  const card = source('RideCardDelivery').split('private static void completePublished')[1];
  assert.ok(card.indexOf('previous.optBoolean("displayed")') < card.indexOf('RideAlertAudioService.startPublished'));
  assert.match(card, /synchronized \(NativeRideDelivery.LOCK\)/);
});
test('audio_started follows MediaPlayer playback, never just service startup', () => {
  const player = source('RideAlertAudioPlayer');
  assert.match(player, /if \(!reportedPlaying && player.isPlaying\(\)\).*observe\("audio_started", "PLAYER_STARTED"\)/);
  assert.match(player, /audio_suppressed", "AUDIO_FOCUS_DENIED/);
  assert.doesNotMatch(source('RideAlertAudioService'), /audio_started/);
});
