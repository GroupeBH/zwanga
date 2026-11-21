const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');
const nodes = t => t == null || typeof t === 'boolean' ? [] : Array.isArray(t) ? t.flatMap(nodes)
  : [t, ...nodes(t.props?.children), ...nodes(t.props?.headerActions)];
const product = { id: 'phone', name: 'Téléphone test', kind: 'phone', description: 'Description de test', details: {},
  prices: { cashTotalMinor: '8000000', creditTotalMinor: '10000000', cashSavingMinor: '2000000' } };
function fixture(card = false) {
  const hooks = hookHarness(), paths = [], reads = [], retries = [];
  let enabled = true, dimensions = { width: 390, fontScale: 1 };
  const products = { currentData: { items: [], nextCursor: null }, isFetching: false, isError: false, refetch: () => retries.push('products') };
  const categories = { currentData: { items: [{ id: 'phone', name: 'Téléphones', kind: 'phone' }, { id: 'custom', name: 'Sécurité et casques', kind: 'equipment' }] }, refetch: () => retries.push('categories') };
  const load = loader({ react: hooks.react,
    'react-native': { Text: 'Text', View: 'View', Image: 'Image', TouchableOpacity: 'Press', ActivityIndicator: 'Loading', StyleSheet: { create: x => x }, useWindowDimensions: () => dimensions },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'expo-router': { router: { push: p => paths.push(p) } },
    '@/features/pro-services/ServiceLayout': { ServiceLayout: 'Layout', ServiceButton: 'Button' },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => enabled },
    '@/hooks/useDisplayReads': { useDisplayReadsEnabled: x => x, displayReadOptions: x => ({ skip: !x }) },
    '@/store/api/commerceApi': {
      useCommerceCategoriesQuery: (_arg, opts) => { reads.push({ endpoint: 'categories', opts }); return categories; },
      useCommerceProductsQuery: (arg, opts) => { reads.push({ endpoint: 'products', arg, opts }); return products; },
    },
  });
  const Screen = card ? load('features/pro-services/CommerceCatalogueParts.tsx').CatalogueProductCard : load('app/services/catalogue.tsx').default;
  const render = () => nodes(hooks.render(() => card ? Screen({ product, stacked: dimensions.fontScale > 1.2, onPress: () => paths.push('detail') }) : Screen()));
  return { render, paths, reads, retries, products, categories, load,
    find: id => render().find(n => n.props?.testID === id),
    dimensions: d => { dimensions = d; }, pause: () => { enabled = false; } };
}
test('categories have icons, preserve admin names and reset pagination when changed', () => {
  const h = fixture(); h.products.currentData.nextCursor = 'next';
  h.render().find(n => n.props?.title === 'Produits suivants').props.onPress();
  h.render(); assert.equal(h.reads.at(-1).arg.after, 'next');
  h.find('catalogue-category-custom').props.onPress();
  assert.equal(h.find('catalogue-category-custom').props.accessibilityLabel, 'Sécurité et casques');
  assert.equal(h.find('catalogue-category-custom').props.accessibilityState.selected, true);
  assert.deepEqual(h.reads.at(-1).arg, { categoryId: 'custom', after: undefined });
  assert.equal(nodes(h.find('catalogue-category-custom')).find(n => n.type === 'Icon').props.name, 'bag-handle-outline');
});
test('responsive categories wrap without fixed width or text truncation at large fonts', () => {
  const h = fixture();
  assert.equal(h.find('catalogue-category-all').props.style[1].flexBasis, '30%');
  h.dimensions({ width: 320, fontScale: 1 });
  assert.equal(h.find('catalogue-category-all').props.style[1].flexBasis, '46%');
  h.dimensions({ width: 390, fontScale: 2 });
  const layout = h.render().find(n => n.type === 'Layout');
  assert.equal(layout.props.title, 'Catalogue'); assert.equal(layout.props.headerActions, undefined);
  assert.ok(h.render().find(n => n.props?.accessibilityLabel === 'Mes achats et remboursements'));
  assert.equal(h.find('catalogue-category-all').props.style[1].flexBasis, '100%');
  assert.equal(nodes(h.find('catalogue-category-all')).find(n => n.type === 'Text').props.numberOfLines, undefined);
});
test('empty, loading, error and paused reads remain distinct with no invented products', () => {
  const h = fixture(); assert.ok(h.find('catalogue-empty'));
  h.products.isFetching = true; assert.equal(h.find('catalogue-empty'), undefined);
  h.products.isFetching = false; h.products.isError = true;
  assert.ok(h.find('catalogue-error')); assert.equal(h.find('catalogue-empty'), undefined);
  h.pause();
  const retry = nodes(h.find('catalogue-error')).find(n => n.type === 'Press');
  assert.equal(retry.props.disabled, true); retry.props.onPress(); assert.deepEqual(h.retries, []);
  assert.equal(h.reads.at(-1).opts.skip, true);
});
test('catalogue actions only navigate, and a retry refetches both display queries', () => {
  const h = fixture(); h.products.currentData.items = [product];
  h.render().find(n => n.props?.accessibilityLabel === 'Mes achats et remboursements').props.onPress();
  h.render().find(n => n.props?.product === product).props.onPress();
  assert.deepEqual(h.paths, ['/services/purchases', '/services/catalogue/phone']);
  h.products.isError = true; nodes(h.find('catalogue-error')).find(n => n.type === 'Press').props.onPress();
  assert.deepEqual(h.retries, ['products', 'categories']);
});
test('product uses real prices, presents the discount and opens detail without payment', () => {
  const h = fixture(true);
  const text = h.render().filter(n => n.type === 'Text').flatMap(n => nodes(n.props.children)).filter(n => typeof n === 'string').join(' ');
  assert.match(text, /80.*000.*FC/); assert.match(text, /100.*000.*FC/); assert.match(text, /20.*000.*FC.*économisés/);
  assert.match(text, /Photo non disponible/);
  h.find('catalogue-product-phone').props.onPress(); assert.deepEqual(h.paths, ['detail']);
});
test('failed product image falls back to an honest placeholder and a changed URL can load', () => {
  const h = fixture(true); product.details.imageUrl = 'https://example.invalid/phone.png';
  h.find('catalogue-product-image').props.onError();
  assert.ok(h.find('catalogue-product-placeholder')); assert.equal(h.find('catalogue-product-image'), undefined);
  product.details.imageUrl = 'https://example.invalid/replacement.png'; assert.ok(h.find('catalogue-product-image'));
  delete product.details.imageUrl;
});
test('large-text product separates the readable content from its reachable action', () => {
  const h = fixture(true); h.dimensions({ width: 320, fontScale: 2 });
  assert.equal(h.find('catalogue-product-phone').props.accessibilityRole, undefined);
  const buttons = h.render().filter(n => n.props?.accessibilityRole === 'button');
  assert.equal(buttons.length, 1); assert.ok(buttons[0].props.style.minHeight >= 44);
  buttons[0].props.onPress(); assert.deepEqual(h.paths, ['detail']);
});
