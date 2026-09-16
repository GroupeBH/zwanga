import { Colors, Spacing } from '@/constants/styles';
import { HOME_COLORS } from '@/features/home/homeModel';
import {
  Platform,
  StyleSheet
} from 'react-native';
export const styles = StyleSheet.create({
  locationButton: {
    position: 'absolute',
    right: Spacing.lg,
    zIndex: 8,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    ...Platform.select({
      ios: {
        shadowColor: Colors.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.14,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
  }
});
