const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const native = { View: 'View', ScrollView: 'Scroll', TouchableOpacity: 'Button', Text: 'Text',
  StyleSheet: { create: value => value }, Platform: { OS: 'ios', select: value => value.ios } };
function nodes(node) {
  if (Array.isArray(node)) return node.flatMap(nodes);
  return React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
}
const flatten = style => Object.assign({}, ...(Array.isArray(style) ? style : [style]));
const card = id => React.createElement('Card', { key: id, id });

test('map priorities mount only one card, page explicitly and keep stable selection across refreshes', () => {
  const hooks = hookHarness();
  const { HomeMapPriorities } = loader({ react: { ...React, ...hooks.react }, 'react-native': native,
    '@expo/vector-icons': { Ionicons: 'Icon' } })('components/home/HomeMapPriorities.tsx');
  const props = { layout: { top: 100, bottom: 400 }, enabled: true, children: [false, null, card('reservation'), card('trip'), card('request')] };
  const draw = () => hooks.render(() => HomeMapPriorities(props));
  const current = () => nodes(draw()).filter(node => node.type === 'Card').map(node => node.props.id);
  const button = label => nodes(draw()).find(node => node.props.accessibilityLabel === label);
  assert.deepEqual(current(), ['reservation']);
  assert.equal(button('Priorité précédente').props.disabled, true);
  assert.equal(flatten(draw().props.style).position, 'absolute');
  assert.equal(draw().props.pointerEvents, 'box-none');
  button('Priorité suivante').props.onPress();
  assert.deepEqual(current(), ['trip']);
  props.children = [card('reservation'), card('trip'), card('request')];
  assert.deepEqual(current(), ['trip'], 'refetches do not reset the selection');
  button('Priorité suivante').props.onPress();
  assert.deepEqual(current(), ['request']);
  assert.equal(button('Priorité suivante').props.disabled, true);
  button('Priorité précédente').props.onPress();
  assert.deepEqual(current(), ['trip']);
  props.enabled = false;
  assert.ok(nodes(draw()).filter(node => node.type === 'Button').every(node => node.props.disabled));
  props.enabled = true;
  props.children = [card('reservation'), card('request')];
  assert.deepEqual(current(), ['reservation'], 'a removed or dismissed selection cannot remain visible');
  for (const node of nodes(draw()).filter(node => node.type === 'Button')) {
    assert.ok(flatten(node.props.style).minHeight >= 44);
    assert.ok(flatten(node.props.style).minWidth >= 44);
  }
  const scroll = nodes(draw()).find(node => node.type === 'Scroll');
  assert.equal(scroll.props.horizontal, undefined, 'paging must not compete with swipe-to-dismiss');
  assert.equal(scroll.props.nestedScrollEnabled, true);
  assert.equal(flatten(scroll.props.style).maxHeight, 184, 'cards and paging share one bounded scroll area');
  assert.ok(nodes(scroll).some(node => node.props.accessibilityLabel === 'Priorité suivante'), 'the pager stays reachable even in a short map viewport');
  props.layout.compact = true;
  assert.equal(flatten(draw().props.style).right, 80, 'short maps leave the recenter control unobstructed');
  props.children = [card('request')];
  assert.deepEqual(current(), ['request']);
  assert.equal(flatten(nodes(draw()).find(node => node.type === 'Scroll').props.style).maxHeight, 136);
  assert.equal(nodes(draw()).some(node => node.type === 'Button'), false, 'no pager for one priority');
  props.children = [null, false];
  assert.equal(draw(), null);
  hooks.unmount();
});

test('priorities never resize or move the map, sheet, camera padding or location control', () => {
  for (const platform of ['ios', 'android']) {
    for (const height of [568, 844, 1024]) {
      const hooks = hookHarness();
      const { useHomeSheet } = loader({ react: hooks.react,
        'react-native': { ...native, Platform: { OS: platform } } })('hooks/home/useHomeSheet.ts');
      const props = { isDriver: true, width: 390, height, insets: { top: 44, bottom: 34 },
        latestTrips: [], availableDriverRequests: [], hasMapPriorities: false };
      const draw = () => hooks.render(() => useHomeSheet(props));
      const normal = draw();
      props.hasMapPriorities = true;
      const priority = draw();
      const { getTabBarMetrics } = loader({ 'react-native': { ...native, Platform: { OS: platform } } })('constants/navigation.ts');
      assert.equal(priority.sheetHeight, normal.sheetHeight);
      assert.equal(priority.mapBottomOffset, normal.mapBottomOffset);
      assert.equal(priority.sheetBottomOffset, normal.sheetBottomOffset);
      assert.equal(priority.locationButtonBottom, normal.locationButtonBottom);
      assert.equal(priority.homeMapPadding, normal.homeMapPadding);
      assert.equal(priority.onSheetLayout, normal.onSheetLayout, 'a priority must not invalidate the panel layout');
      if (!priority.mapPriorityLayout.compact) {
        assert.ok(priority.mapPriorityLayout.bottom >= priority.locationButtonBottom + 46);
      }
      assert.equal(priority.showLocationLegend, !priority.mapPriorityLayout.compact);
      assert.ok(priority.mapPriorityLayout.top >= props.insets.top + 44);
      const viewportHeight = platform === 'ios' ? height : height - getTabBarMetrics(props.insets.bottom).height;
      const mapHeight = viewportHeight - priority.mapBottomOffset;
      assert.ok(mapHeight > priority.homeMapPadding.top + priority.homeMapPadding.bottom);
      assert.ok(viewportHeight - priority.mapPriorityLayout.top - priority.mapPriorityLayout.bottom >= 44);
      assert.equal(draw().homeMapPadding, priority.homeMapPadding, 'unchanged renders reuse native padding');
      props.hasMapPriorities = false;
      assert.equal(draw().showLocationLegend, true);
      assert.equal(draw().sheetHeight, normal.sheetHeight);
      props.hasMapPriorities = true;
      priority.toggleTripsSheet();
      assert.equal(draw().sheetHeight, 78);
      const collapsed = draw();
      props.hasMapPriorities = false;
      assert.equal(draw().mapBottomOffset, collapsed.mapBottomOffset);
      assert.equal(draw().homeMapPadding, collapsed.homeMapPadding);
      draw().toggleTripsSheet();
      assert.equal(draw().sheetHeight, normal.sheetHeight);
      hooks.unmount();
    }
  }
});

