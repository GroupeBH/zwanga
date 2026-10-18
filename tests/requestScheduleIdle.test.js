const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

test('request preset stops its timer off screen and recomputes on return', t => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  const hooks = hookHarness();
  const values = [];
  const { useRequestSchedule } = loader({
    react: hooks.react,
    'react-native': { Keyboard: { dismiss() {} }, Platform: { OS: 'android' } },
    '@react-native-community/datetimepicker': { DateTimePickerAndroid: { open() {} } },
  })('hooks/trip-request/useRequestSchedule.ts');
  const props = {
    isScreenActive: true, timePreset: 'now', departureDateMin: new Date(),
    flexibilityMinutes: 0, setTimePreset() {},
    setDepartureDateMin: value => values.push(value), setFlexibilityMinutes() {},
  };
  const render = () => hooks.render(() => useRequestSchedule(props));

  render();
  assert.equal(values.length, 1);
  t.mock.timers.tick(30_000);
  assert.equal(values.length, 2);
  props.isScreenActive = false;
  render();
  t.mock.timers.tick(90_000);
  assert.equal(values.length, 2);
  props.isScreenActive = true;
  render();
  assert.equal(values.length, 3);
  hooks.unmount();
  t.mock.timers.tick(60_000);
  assert.equal(values.length, 3);
});
