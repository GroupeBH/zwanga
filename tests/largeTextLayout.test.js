const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const fs = require('node:fs');
const path = require('node:path');
const { loader } = require('./helpers/loadTypeScript.cjs');
const nodes = node => Array.isArray(node) ? node.flatMap(nodes) : React.isValidElement(node) ? [node, ...nodes(node.props.children)] : [];
const flat = style => Object.assign({}, ...(Array.isArray(style) ? style.filter(Boolean) : [style]));
const native = fontScale => ({ Text: 'Text', View: 'View', TouchableOpacity: 'Button', ScrollView: 'Scroll',
  useWindowDimensions: () => ({ width: 360, height: 640, fontScale }),
  StyleSheet: { create: s => s }, PixelRatio: { getFontScale: () => fontScale }, Platform: { OS: 'ios' } });

test('200 percent cards stack price and route without shrinking or clipping essential copy', () => {
  const load = loader({ 'react-native': native(2), '@expo/vector-icons': { Ionicons: 'Icon' } });
  const { CompactTripCard } = load('components/trip/CompactTripCard.tsx');
  const tree = CompactTripCard.type({ label: 'Votre réservation', departure: 'Départ avec repère détaillé',
    arrival: 'Destination avec repère détaillé', metadata: 'Aujourd’hui à 16 h', priceText: '100 000 FC', priceHint: '/ place', inlineRoute: true, onPress() {} });
  const texts = nodes(tree).filter(n => n.type === 'Text');
  for (const n of texts) { assert.equal(n.props.numberOfLines, undefined); assert.ok(!n.props.adjustsFontSizeToFit); }
  assert.ok(nodes(tree).some(n => flat(n.props.style).flexDirection === 'column'));
  assert.equal(flat(texts.find(n => n.props.children === 'Votre réservation').props.style).flex, 0);
  assert.equal(nodes(tree).some(n => n.props.name === 'arrow-forward'), false);
});

test('tab height and floating offsets follow large text without changing safe-area padding', () => {
  const normal = loader({ 'react-native': native(1) })('constants/navigation.ts');
  const large = loader({ 'react-native': native(2) })('constants/navigation.ts');
  assert.equal(large.getTabBarMetrics(34).height, normal.getTabBarMetrics(34).height + 24);
  assert.equal(large.getTabBarMetrics(34).paddingBottom, 34);
  assert.equal(large.getFloatingBannerBottomOffset(34) - normal.getFloatingBannerBottomOffset(34), 24);
});

test('large driver header gives status its own row; decorative counters retain an accessible full label', () => {
  const { HomeHeader } = loader({ 'react-native': native(2), '@expo/vector-icons': { Ionicons: 'Icon' },
    './HomeDriverStatus': { HomeDriverStatus: 'DriverStatus' } })('components/home/HomeHeader.tsx');
  const tree = HomeHeader.type({ insets: { top: 20 }, isDriver: true, router: { push() {} }, profileInitial: 'T', unreadNotifications: 14 });
  assert.ok(nodes(tree).some(n => flat(n.props.style).flexDirection === 'column-reverse'));
  const statusSlot = nodes(tree).find(n => n.type === 'View' && n.props.children?.type === 'DriverStatus');
  assert.equal(flat(statusSlot.props.style).flex, 0, 'status keeps intrinsic height in a vertical header');
  assert.ok(nodes(tree).some(n => n.props.accessibilityLabel === 'Notifications, 14 non lues'));
});

test('large text priorities belong to scrollable Home content, not the constrained map overlay', () => {
  const source = fs.readFileSync(path.join(__dirname, '../components/home/HomeDashboard.tsx'), 'utf8');
  assert.match(source, /home\.hasMapPriorities && !largeText/);
  assert.match(source, /priorityContent=\{largeText && home\.hasMapPriorities/);
  const sheet = fs.readFileSync(path.join(__dirname, '../components/home/HomeTripsSheet.tsx'), 'utf8');
  assert.ok(sheet.indexOf('{priorityContent}') > sheet.indexOf('<ScrollView'));
  assert.match(sheet, /fontScale > 1\.3 && styles\.metricsStack/);
  assert.match(sheet, /fontScale > 1\.3 && styles\.stackedMetricCard/);
  assert.match(sheet, /stacked=\{fontScale > 1\.3\}/);
  const styles = loader({ 'react-native': native(2) })('features/home/HomeTripsSheet.styles.ts').styles;
  assert.equal(styles.stackedMetricCard.flex, 0, 'vertical metrics grow with their content rather than sharing a fixed height');
});
