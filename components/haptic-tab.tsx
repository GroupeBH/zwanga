import { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import * as Device from 'expo-device';
import * as Haptics from 'expo-haptics';

export function HapticTab(props: BottomTabBarButtonProps) {
  return (
    <PlatformPressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios' && Device.isDevice) {
          // Add a soft haptic feedback when pressing down on the tabs.
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {
            // Haptics can be unavailable (for example in a simulator).
          });
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
