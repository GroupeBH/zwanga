const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { loader } = require('./helpers/loadTypeScript.cjs');

test('old order cards show commande while booking labels and action IDs stay unchanged', () => {
  const { driverNotificationCard, driverNotificationActions } = loader()('features/notifications/driverNotificationCard.ts');
  for (const kind of ['nearby', 'dispatch']) {
    const data = { invitationText: 'Nouvelle demande : 1 200 FC', sharedTrip: true };
    const card = driverNotificationCard(kind, data);
    assert.match(card.title, /Commande/);
    assert.match(card.body, /Nouvelle commande : Prix à consulter dans Zwanga/);
    assert.equal(data.invitationText, 'Nouvelle demande : 1 200 FC');
  }
  assert.deepEqual(driverNotificationActions('nearby', { sharedTrip: true }).map(action => [action.title, action.pressAction.id]),
    [['Refuser', 'driver-ignore-nearby'], ['Voir la commande', 'driver-review-nearby']]);
  assert.match(driverNotificationCard('booking', {}).title, /Nouvelle réservation/);
  assert.deepEqual(driverNotificationActions('booking', {}).map(action => action.pressAction.id), ['driver-decline', 'driver-accept']);
});

test('inbox rendering translates old text without mutating the notification opened on press', () => {
  const h = loader({ react: { memo: fn => fn },
    'react-native': { Text: 'Text', View: 'View', TouchableOpacity: 'TouchableOpacity', StyleSheet: { create: value => value } },
    '@expo/vector-icons': { Ionicons: 'Icon' }, '../screen-styles/app/notifications/index': { styles: {} } });
  const { NotificationListItem } = h('features/notifications/NotificationListItem.tsx');
  const notification = { id: 'test', title: 'Demande acceptée', body: 'Consultez votre demande.',
    isRead: false, createdAt: new Date().toISOString(), data: { type: 'trip_request_accepted', tripRequestId: 'order' } };
  const snapshot = JSON.stringify(notification);
  let pressed;
  const tree = NotificationListItem({ notification, onDelete() {}, onPress: item => { pressed = item; } });
  const strings = [];
  const visit = value => {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value?.props) visit(value.props.children);
  };
  visit(tree);
  assert.ok(strings.includes('Commande acceptée'));
  assert.ok(strings.includes('Consultez votre commande.'));
  tree.props.onPress();
  assert.equal(pressed, notification);
  assert.equal(JSON.stringify(notification), snapshot);
  const detail = fs.readFileSync('app/notifications.tsx', 'utf8');
  assert.match(detail, /orderNotificationText\(selectedNotification\?\.title/);
  assert.match(detail, /orderNotificationText\(selectedNotification\?\.body/);
});

test('Android full-screen and notification sources use commande with canonical parity', () => {
  for (const file of ['IncomingRideView.java', 'RideNotificationBundle.java']) {
    const canonical = fs.readFileSync(`native/android/notifications/${file}`, 'utf8');
    const generated = fs.readFileSync(`android/app/src/main/java/com/zwanga/notifications/${file}`, 'utf8');
    assert.equal(canonical.replace(/\r\n/g, '\n'), generated.replace(/\r\n/g, '\n'));
    assert.match(canonical, /COMMANDE|commande/);
    assert.doesNotMatch(canonical, /NOUVELLE DEMANDE|Nouvelle demande|Voir la demande/);
  }
});
