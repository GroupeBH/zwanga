import { HOME_DASHBOARD_COLORS as c } from '@/features/home/homeDashboardTheme';
import { HOME_LOADER_ROUTE } from '@/features/home/homeLoaderJourney';
import { useHomeLoaderMotion } from '@/hooks/home/useHomeLoaderMotion';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

/** A small vector journey, not a real map or an indication that a car is assigned. */
export function HomeRideLoaderVisual({ running }: { running: boolean }) {
  const motion = useHomeLoaderMotion(running);
  return <View style={styles.scene} pointerEvents="none" accessible={false}
    accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="home-loader-journey">
    <Svg width={296} height={248} viewBox="0 0 296 248">
      <Path d="M23 105C29 50 94 24 166 30C236 36 284 72 283 135C281 199 222 228 143 220C61 232 8 186 23 105Z" fill="#F2EFE9" />
      <G stroke={c.warm} strokeWidth={10} strokeLinecap="round" fill="none">
        <Path d="M10 115L288 115M61 30L61 226M206 24L185 230M24 200L277 169" />
        <Path d="M102 27L110 78Q112 90 130 90H280" strokeWidth={7} />
      </G>
      <Path d="M29 53L46 48L49 74L31 79Z" fill="#E3E9E0" />
      <Rect x={215} y={137} width={38} height={17} rx={8} fill="#E3E9E0" />
      <Path d={HOME_LOADER_ROUTE} stroke="#FFFFFF" strokeWidth={13} fill="none" strokeLinecap="round" />
      <Path d={HOME_LOADER_ROUTE} stroke={c.orange} strokeWidth={4} fill="none" strokeLinecap="round" />
      <Circle cx={44} cy={178} r={10} fill="#FFFFFF" />
      <Circle cx={44} cy={178} r={5} fill={c.orange} />
      {/* Two people at the departure point evoke a shared ride without role-specific UI. */}
      <G transform="translate(28 198)" fill={c.blue}>
        <Circle cx={11} cy={5} r={4} />
        <Path d="M3 20V18C3 9 19 9 19 18V20Z" />
        <Circle cx={23} cy={6} r={3.2} opacity={0.5} />
        <Path d="M23 13C28 13 30 16 30 20H22V18C22 16 21 14 20 13Z" opacity={0.5} />
      </G>
    </Svg>
    <Animated.View testID="home-loader-arrival-halo" style={[styles.halo, motion.halo]} />
    <Svg style={styles.destination} width={32} height={40} viewBox="0 0 32 40">
      <Path d="M16 38S2 24 2 16A14 14 0 0 1 30 16C30 24 16 38 16 38Z" fill={c.orange} stroke={c.warm} strokeWidth={2} />
      <Circle cx={16} cy={16} r={5} fill="#FFFFFF" />
    </Svg>
    <Animated.View testID="home-loader-car" style={[styles.car, motion.car]}>
      <Svg width={44} height={28} viewBox="0 0 44 28">
        <Rect x={10} y={0} width={7} height={7} rx={2} fill={c.ink} />
        <Rect x={29} y={0} width={7} height={7} rx={2} fill={c.ink} />
        <Rect x={10} y={21} width={7} height={7} rx={2} fill={c.ink} />
        <Rect x={29} y={21} width={7} height={7} rx={2} fill={c.ink} />
        <Rect x={1} y={3} width={42} height={22} rx={9} fill={c.blue} stroke="#FFFFFF" strokeWidth={1.5} />
        <Path d="M30 6L36 9V19L30 22Z M11 6L7 9V19L11 22Z" fill="#B9CDD5" />
        <Rect x={14} y={7} width={12} height={14} rx={3} fill="#354464" />
        <Path d="M16 9H24" stroke={c.positionOrange} strokeWidth={2} strokeLinecap="round" />
        <Path d="M39 8V10M39 18V20" stroke="#FFF3D5" strokeWidth={2} strokeLinecap="round" />
      </Svg>
    </Animated.View>
  </View>;
}

const styles = StyleSheet.create({
  scene: { width: 296, height: 248 },
  car: { position: 'absolute', left: -22, top: -14, width: 44, height: 28 },
  halo: { position: 'absolute', left: 226, top: 48, width: 44, height: 44, borderRadius: 22, backgroundColor: c.orange },
  destination: { position: 'absolute', left: 232, top: 32 },
});
