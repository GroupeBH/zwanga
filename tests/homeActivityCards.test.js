const test = require('node:test');
const assert = require('node:assert/strict');
const React = require('react');
const { loader } = require('./helpers/loadTypeScript.cjs');

const load = loader({
  'react-native': {
    Text: 'Text', View: 'View', TouchableOpacity: 'Button',
    StyleSheet: { create: styles => styles },
  },
  '@expo/vector-icons': { Ionicons: 'Icon' },
});
const { HomeActivityCards } = load('components/home/HomeActivityCards.tsx');
const upcoming = {
  id: 'upcoming', departure: { name: 'Gombe' }, arrival: { name: 'Lemba' },
  departureTime: '2026-09-16T17:00:00Z', price: 2000,
};
const request = {
  id: 'nearest', departure: { name: 'Victoire' }, arrival: { name: 'UPN' },
  departureDateMin: '2026-09-16T17:30:00Z', numberOfSeats: 2,
};

function nodes(element) {
  if (Array.isArray(element)) return element.flatMap(nodes);
  if (!React.isValidElement(element)) return [];
  const component = typeof element.type === 'function' ? element.type : element.type?.type;
  if (typeof component === 'function') return nodes(component(element.props));
  return [element, ...nodes(element.props.children)];
}
function render(overrides = {}) {
  const routes = [];
  const tree = HomeActivityCards.type({
    router: { push: route => routes.push(route) },
    openTripRequestDetail: id => routes.push(`/request/${id}`),
    featuredDriverUpcomingTrip: upcoming,
    featuredDriverUpcomingTripSeatsLabel: '3 places libres',
    highlightedDriverRequest: request,
    highlightedRequestDistance: 500,
    ...overrides,
  });
  return { routes, elements: nodes(tree), buttons: nodes(tree).filter(node => node.type === 'Button') };
}

test('the upcoming trip remains visible before the nearby request and both keep their destinations', () => {
  const { buttons, routes } = render();
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].props.accessibilityLabel, 'Ouvrir le trajet publié qui démarre bientôt');
  assert.match(buttons[1].props.accessibilityLabel, /Voir la demande à accepter/);
  buttons.forEach(button => button.props.onPress());
  assert.deepEqual(routes, ['/trip/manage/upcoming', '/request/nearest']);
});

test('without an upcoming trip, the highlighted request remains directly accessible', () => {
  const { buttons, routes } = render({ featuredDriverUpcomingTrip: null });
  assert.equal(buttons.length, 1);
  buttons[0].props.onPress();
  assert.deepEqual(routes, ['/request/nearest']);
});

test('removing an expired highlight neither hides nor duplicates the upcoming trip', () => {
  const { buttons } = render({ highlightedDriverRequest: null });
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].props.accessibilityLabel, 'Ouvrir le trajet publié qui démarre bientôt');
  assert.equal(render({ featuredDriverUpcomingTrip: null, highlightedDriverRequest: null }).buttons.length, 0);
});

test('a received reservation also precedes a highlighted request without losing its action', () => {
  const { buttons, routes } = render({
    featuredDriverUpcomingTrip: null,
    featuredDriverReservation: { trip: { ...upcoming, id: 'reserved' } },
    featuredDriverReservationStatus: { bg: '#fff', color: '#000', icon: 'time', label: 'À confirmer' },
    featuredDriverReservationPassengerName: 'Alex',
    featuredDriverReservationSeatsLabel: '1 place',
  });
  assert.equal(buttons.length, 2);
  assert.equal(buttons[0].props.accessibilityLabel, 'Ouvrir la réservation reçue');
  buttons.forEach(button => button.props.onPress());
  assert.deepEqual(routes, ['/trip/manage/reserved', '/request/nearest']);
});

test('reservation and upcoming trip departure/destination names are bold without making the separator bold', () => {
  const { elements } = render({
    featuredDriverReservation: { trip: { ...upcoming, id: 'reserved' } },
    featuredDriverReservationStatus: { bg: '#fff', color: '#000', icon: 'time', label: 'À confirmer' },
    featuredDriverReservationPassengerName: 'Alex', featuredDriverReservationSeatsLabel: '1 place',
  });
  const labels = elements.filter(node => node.type === 'Text' && ['Gombe', 'Lemba'].includes(node.props.children));
  assert.equal(labels.length, 4);
  labels.forEach(label => assert.equal(label.props.style.fontWeight, '700'));
});
