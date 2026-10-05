const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loader } = require('./helpers/loadTypeScript.cjs');
const words = node => typeof node === 'string' ? node : Array.isArray(node) ? node.map(words).join(' ')
  : node?.props ? words(node.props.children) : '';

test('passenger copy distinguishes travel, pending confirmation and confirmed arrival', () => {
  const { PassengerNavigationInfoCard } = loader({
    'react-native': { View: 'View', Text: 'Text', TouchableOpacity: 'Button', ActivityIndicator: 'Spinner', StyleSheet: { create: x => x } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '@/utils/reanimated': { __esModule: true, default: { View: 'AnimatedView' }, FadeInUp: { duration: () => ({ delay: () => null }) } },
    '../screen-styles/app/booking/navigate/detail/index': { styles: {} },
    '@/features/ride-recovery/RideRecoveryControl': { RideRecoveryControl: 'Recovery' },
    '@/components/trip/PausedPassengerRideNotice': { PausedPassengerRideNotice: 'PausedNotice' },
  })('features/passenger-navigation/PassengerNavigationInfoCard.tsx');
  const booking = { id: 'booking', passengerOrigin: 'Départ', passengerDestination: 'Destination',
    pickedUp: true, pickedUpConfirmedByPassenger: true, droppedOff: false, droppedOffConfirmedByPassenger: false };
  const render = patch => words(PassengerNavigationInfoCard({ data: {
    booking: { ...booking, ...patch }, trip: { status: 'ongoing' }, insets: { bottom: 0 },
  }, state: {}, presentation: {}, interruption: {}, tripActions: {} }));
  assert.match(render({}), /En route vers votre destination/);
  assert.doesNotMatch(render({}), /Arrivée à destination confirmée|Trajet terminé/);
  const pending = render({ droppedOffConfirmedByPassenger: true });
  assert.match(pending, /Confirmation de l’arrivée à destination en cours/);
  assert.doesNotMatch(pending, /Arrivée à destination confirmée|Trajet terminé/);
  const confirmed = render({ droppedOff: true, droppedOffConfirmedByPassenger: true });
  assert.match(confirmed, /Arrivée à destination confirmée/);
  assert.doesNotMatch(confirmed, /en cours|Trajet terminé|dépose/i);
});

test('in-progress ride presentation no longer uses the old arrival terminology', () => {
  const scopes = ['driver-navigation', 'passenger-navigation', 'ride-recovery', 'driver-payments'];
  for (const scope of scopes) {
    const folder = path.join(process.cwd(), 'features', scope);
    for (const file of fs.readdirSync(folder).filter(file => /\.tsx?$/.test(file))) {
      assert.doesNotMatch(fs.readFileSync(path.join(folder, file), 'utf8'), /\bd[ée]pos[ée]/iu, `${scope}/${file}`);
    }
  }
});
