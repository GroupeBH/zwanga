const test = require('node:test');
const assert = require('node:assert/strict');
const { testNotificationTarget, fullscreenTarget } = require('../scripts/audit-android-alerts.cjs');
const row = inner => `<node resource-id="com.android.systemui:id/expandableNotificationRow">${inner}</node>`;
const action = (name, bounds) => `<node text="${name}" bounds="${bounds}" />`;
const own = '<node text="Zwanga [TEST]" /><node text="Départ TEST → Destination TEST" />';

test('emulator audit targets only the synthetic notification, not an unrelated action', () => {
  const xml = row(action('Accepter', '[0,0][20,20]')) + row(own + action('Accepter', '[40,60][80,100]'));
  assert.deepEqual(testNotificationTarget(xml, 'Accepter'), [60, 80]);
});
test('emulator audit refuses to tap outside its test notification', () => {
  const xml = row(action('Refuser', '[0,0][20,20]')) + row(own);
  assert.throws(() => testNotificationTarget(xml, 'Refuser'), /not visible/);
  assert.throws(() => testNotificationTarget(row(action('Refuser', '[0,0][20,20]')), 'Refuser'), /refusing blind interaction/);
});
test('emulator audit needs both its test marker and synthetic route', () => {
  assert.throws(() => testNotificationTarget(row('<node text="Another [TEST]" />' + action('Accepter', '[0,0][20,20]')), 'Accepter'), /refusing blind interaction/);
});

const nativeButton = (text, extra = '') => `<node text="${text}" package="com.zwanga.audit" clickable="true" enabled="true" bounds="[40,60][80,100]" ${extra} />`;
test('fullscreen audit follows the current request-ticket labels', () => {
  for (const [command, text] of [['Accepter', '✓  Accepter la course'], ['Refuser', 'Refuser'],
    ['Ouvrir dans Zwanga', 'Voir le détail dans Zwanga']]) {
    assert.deepEqual(fullscreenTarget(nativeButton(text), command), [60, 80]);
  }
});
test('fullscreen audit refuses another app, disabled buttons and invisible bounds', () => {
  for (const xml of [nativeButton('Refuser').replace('com.zwanga.audit', 'com.android.systemui'),
    nativeButton('Refuser').replace('enabled="true"', 'enabled="false"'),
    nativeButton('Refuser').replace('[40,60][80,100]', '[0,0][0,0]')]) {
    assert.throws(() => fullscreenTarget(xml, 'Refuser'), /button absent/);
  }
});
