import type React from 'react';
import { Platform } from 'react-native';
import Reanimated from 'react-native-reanimated';
export * from 'react-native-reanimated';

type AnimatedViewProps = React.ComponentProps<typeof Reanimated.View>;

const AndroidSafeAnimatedView = ({
  entering: _entering,
  exiting: _exiting,
  layout: _layout,
  ...props
}: AnimatedViewProps) => <Reanimated.View {...props} />;

AndroidSafeAnimatedView.displayName = 'AndroidSafeAnimatedView';

const Animated =
  Platform.OS === 'android'
    ? {
        ...Reanimated,
        View: AndroidSafeAnimatedView,
      }
    : Reanimated;

export default Animated;
