const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');

test('v4 native backup channel is quiet and private; cleanup accepts only exact ride tags', async () => {
  const channels = [], cancelled = [];
  const load = loader({
    'react-native': { Platform: { OS: 'android' } },
    '@notifee/react-native': { __esModule: true, default: { createChannel: async x => channels.push(x) },
      AndroidImportance: { DEFAULT: 3 }, AndroidVisibility: { PRIVATE: 0 } },
    'expo-notifications': { dismissNotificationAsync: async id => cancelled.push(id) },
  });
  const service = load('services/driverAlertFallback.ts');
  await service.configureDriverAlertFallback();
  assert.equal(channels[0].sound, undefined);
  assert.equal(channels[0].vibration, false);
  assert.equal(channels[0].visibility, 0);
  await service.dismissDriverAlertFallback({ fallbackTag: 'chat-message' });
  const tag = 'ride-backup-booking-00000000-0000-4000-8000-000000000001';
  await service.dismissDriverAlertFallback({ fallbackTag: tag });
  assert.deepEqual(cancelled, [tag]);
});

test('installed Expo native delegate presents v4 data without JS and honors its stable tag/channel', () => {
  const root = 'node_modules/expo-notifications/android/src/main/java/expo/modules/notifications/';
  const read = name => fs.readFileSync(root + name, 'utf8');
  assert.match(read('service/delegates/ExpoHandlingDelegate.kt'), /else if \(notification.shouldPresent\(\)\)/);
  assert.match(read('service/delegates/ExpoHandlingDelegate.kt'), /NotificationsService.present\(context, notification\)/);
  assert.match(read('service/delegates/FirebaseMessagingDelegate.kt'), /remoteMessage.data\["tag"\]/);
  assert.match(read('notifications/model/triggers/FirebaseNotificationTrigger.kt'), /remoteMessage.data\["channelId"\]/);
  assert.match(read('notifications/model/NotificationData.kt'), /data\["body"\].*JSONObject/);
});
