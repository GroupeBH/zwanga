/* global __dirname */
const fs = require('node:fs');
const path = require('node:path');
const marker = 'ZWANGA_EXPO_DRIVER_ACTIONS_V2';
const anchor = '  // handle notification outside of notifee';
const bridge = `  // ${marker}: Expo places custom APNs data in userInfo.body.
  // Only our v2 driver category is claimed. Other Expo/Notifee delegates stay unchanged.
  NSDictionary *zwangaInfo = response.notification.request.content.userInfo;
  id zwangaBody = zwangaInfo[@"body"];
  if (notifeeNotification == nil && [zwangaBody isKindOfClass:[NSDictionary class]] &&
      [response.notification.request.content.categoryIdentifier isEqualToString:@"driver-offer-v2"] &&
      [zwangaBody[@"actionProtocol"] isEqual:@"driver-v1"] &&
      ([zwangaBody[@"type"] isEqual:@"new_booking"] || [zwangaBody[@"type"] isEqual:@"driver_dispatch_offer"])) {
    NSMutableDictionary *zwangaNotification = [[NotifeeCoreUtil parseUNNotificationRequest:response.notification.request] mutableCopy];
    zwangaNotification[@"data"] = zwangaBody;
    notifeeNotification = zwangaNotification;
  }

`;
function patch(source) {
  if (source.includes(marker)) return source;
  if (source.split(anchor).length !== 2) throw new Error('Notifee iOS delegate changed; review the driver-action bridge before building.');
  return source.replace(anchor, bridge + anchor);
}
module.exports = { patch, marker };
if (require.main === module) {
  const target = path.resolve(__dirname, '../node_modules/@notifee/react-native/ios/NotifeeCore/NotifeeCore+UNUserNotificationCenter.m');
  const before = fs.readFileSync(target, 'utf8'), after = patch(before);
  if (after !== before) fs.writeFileSync(target, after);
  console.log('Notifee/Expo iOS driver-action bridge ready.');
}
