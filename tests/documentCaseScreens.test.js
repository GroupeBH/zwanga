const test = require('node:test');
const assert = require('node:assert/strict');
const { loader } = require('./helpers/loadTypeScript.cjs');
const { hookHarness } = require('./helpers/hookHarness.cjs');

const offering = { code: 'documents', availability: 'open', documentOptions: [] };
const native = { ActivityIndicator: 'Spinner', Text: 'Text', View: 'View' };
const layout = { ServiceLayout: 'Layout', ServiceButton: 'Button', s: {} };
const form = { ServiceRequestForm: 'Form' };
function nodes(tree) {
  if (tree == null || typeof tree === 'boolean') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}

test('new document screen never creates before the existing dossier check has completed', () => {
  let current = { isFetching: true, currentData: { request: null } };
  const routes = [];
  const Screen = loader({
    'react-native': native,
    'expo-router': { router: { replace: value => routes.push(value) }, useLocalSearchParams: () => ({ service: 'documents' }) },
    '@/features/pro-services/ServiceLayout': layout,
    '@/features/pro-services/ServiceRequestForm': form,
    '@/store/hooks': { useAppSelector: () => ({ id: 'owner' }) },
    '@/store/selectors': { selectUser: () => {} },
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/api/proServicesApi': {
      useGetProOfferingsQuery: () => ({ data: [offering] }),
      useGetCurrentDocumentCaseQuery: () => current,
    },
  })('app/services/new.tsx').default;
  assert.equal(nodes(Screen()).some(node => node.type === 'Form'), false);
  current = { isError: true };
  assert.equal(nodes(Screen()).some(node => node.type === 'Form'), false);
  current = { currentData: { request: { id: 'existing', status: 'completed', canEdit: true } } };
  const tree = nodes(Screen());
  assert.equal(tree.some(node => node.type === 'Form'), false);
  const button = tree.find(node => node.type === 'Button');
  assert.equal(button.props.title, 'Modifier ma demande');
  button.props.onPress();
  assert.equal(routes[0], '/services/edit?id=existing');
  current = { currentData: { request: null } };
  assert.equal(Screen().type, 'Form');
});

test('editing retains its original snapshot while the server refreshes, and never uses another dossier', () => {
  const harness = hookHarness();
  let id = 'existing';
  const first = { id, serviceCode: 'documents', canEdit: true, updatedAt: 'first', application: {} };
  let result = { currentData: first, isFetching: true };
  const Screen = loader({
    react: harness.react, 'react-native': native,
    'expo-router': { router: {}, useLocalSearchParams: () => ({ id }) },
    '@/features/pro-services/ServiceLayout': layout,
    '@/features/pro-services/ServiceRequestForm': form,
    '@/hooks/useAppIsActive': { useScreenIsActive: () => true },
    '@/store/api/proServicesApi': {
      useGetProOfferingsQuery: () => ({ data: [offering] }),
      useGetProCaseQuery: () => result,
    },
  })('app/services/edit.tsx').default;
  const render = () => harness.render(Screen);
  assert.notEqual(render().type, 'Form');
  result.isFetching = false;
  render();
  assert.equal(render().props.existing, first);
  result = { currentData: { ...first, updatedAt: 'newer' }, isFetching: true };
  assert.equal(render().props.existing, first);
  result.isFetching = false;
  render();
  assert.equal(render().props.existing, first);
  id = 'another';
  assert.notEqual(render().type, 'Form');
});
