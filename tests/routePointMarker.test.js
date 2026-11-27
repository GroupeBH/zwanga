const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const flatten = styles => Object.assign({}, ...[styles].flat().filter(Boolean));

function setup(t, platform = 'android') {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const h = hookHarness(); t.after(() => h.unmount());
  const components = loader({ react: { ...React, ...h.react }, 'react-native': {
    View: 'View', Platform: { OS: platform }, StyleSheet: { create: x => x } },
    'react-native-maps': { Marker: 'Marker' },
  })('components/maps/RoutePointMarker.tsx');
  const props = { kind: 'departure', coordinate: { latitude: -4.32, longitude: 15.3 }, title: 'Départ', description: 'Repère', zIndex: 26 };
  const render = () => h.render(() => components.RoutePointMarker.type(props));
  return { ...components, props, render, unmount: h.unmount };
}

test('small symbols distinguish endpoints by shape AND colour, with a larger native frame', t => {
  const f = setup(t);
  const start = f.RoutePointSymbol({ kind: 'departure' }), end = f.RoutePointSymbol({ kind: 'arrival' });
  assert.deepEqual([start.props.style.width, start.props.style.height], [44, 44]);
  assert.equal(start.props.collapsable, false);
  const a = flatten(start.props.children.props.style), b = flatten(end.props.children.props.style);
  assert.deepEqual([a.width, a.height, b.width, b.height], [24, 24, 24, 24]);
  assert.equal(a.borderColor, '#FFFFFF'); assert.equal(a.borderWidth, 3);
  assert.notEqual(a.backgroundColor, b.backgroundColor); assert.notEqual(a.borderRadius, b.borderRadius);
  const active = flatten(f.RoutePointSymbol({ kind: 'arrival', highlighted: true }).props.children.props.style);
  assert.equal(active.width, 28); assert.equal(active.height, 28);
});

test('Android snapshot refresh is bounded; neither rerender nor coordinate update restarts it', t => {
  const f = setup(t); let redraws = 0;
  let tree = f.render(); tree.props.ref.current = { redraw: () => redraws++ };
  assert.equal(tree.props.image, undefined); assert.deepEqual(tree.props.anchor, { x: 0.5, y: 0.5 });
  assert.equal(tree.props.title, 'Départ'); assert.equal(tree.props.description, 'Repère'); assert.equal(tree.props.zIndex, 26);
  assert.equal(tree.props.tracksViewChanges, true);
  for (let n = 0; n < 100; n++) tree.props.children.props.onReady();
  t.mock.timers.tick(320); tree = f.render();
  assert.equal(redraws, 2); assert.equal(tree.props.tracksViewChanges, false);
  f.props.coordinate = { latitude: -4.35, longitude: 15.31 };
  for (let n = 0; n < 50; n++) { f.render().props.children.props.onReady(); t.mock.timers.tick(400); }
  assert.equal(redraws, 2); assert.deepEqual(f.render().props.coordinate, f.props.coordinate);
  f.props.kind = 'arrival'; f.props.highlighted = true;
  tree = f.render(); assert.equal(tree.props.tracksViewChanges, true);
  t.mock.timers.tick(320); assert.equal(f.render().props.tracksViewChanges, false); assert.equal(redraws, 4);
  f.props.kind = 'departure'; f.render(); f.unmount(); t.mock.timers.tick(1000);
  assert.equal(redraws, 4, 'no native redraw after unmount');
});

test('iOS uses the compact native view without Android redraw timers', t => {
  const f = setup(t, 'ios'); let redraws = 0;
  const tree = f.render(); tree.props.ref.current = { redraw: () => redraws++ };
  tree.props.children.props.onReady(); t.mock.timers.tick(1000);
  assert.equal(f.render().props.tracksViewChanges, false); assert.equal(redraws, 0);
});

test('memoization compares coordinate values, while keeping meaningful appearance and action changes', t => {
  const f = setup(t), same = { ...f.props, coordinate: { ...f.props.coordinate } };
  assert.equal(f.RoutePointMarker.compare(f.props, same), true);
  for (const change of [{ kind: 'arrival' }, { highlighted: true }, { title: 'Destination' }, { description: 'Autre repère' },
    { zIndex: 30 }, { onPress() {} }, { coordinate: { latitude: -4.5, longitude: 15.3 } }]) {
    assert.equal(f.RoutePointMarker.compare(f.props, { ...same, ...change }), false);
  }
});
