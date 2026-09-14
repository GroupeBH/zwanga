import {
  StyleSheet
} from 'react-native';
import { IS_ANDROID } from './homeMapPolicy';
export const styles = StyleSheet.create({
  tripVehicleMarkerFrame: {
    width: IS_ANDROID ? 96 : 86,
    height: IS_ANDROID ? 96 : 86,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  tripVehicleMarkerImageShell: {
    width: IS_ANDROID ? 72 : 70,
    height: IS_ANDROID ? 72 : 70,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  tripVehicleMarkerImage: {
    width: IS_ANDROID ? 56 : 58,
    height: IS_ANDROID ? 56 : 58,
  },
  tripVehicleMarkerImageSelected: {
    width: IS_ANDROID ? 62 : 64,
    height: IS_ANDROID ? 62 : 64,
  },
  userLocationMarkerFrame: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  userLocationMarkerImage: {
    width: 58,
    height: 58,
  },
  userLocationMarkerFrameAndroid: {
    width: 46,
    height: 46,
  },
  userLocationMarkerImageAndroid: {
    width: 42,
    height: 42,
  }
});
