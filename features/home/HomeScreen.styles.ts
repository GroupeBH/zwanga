import { HOME_COLORS } from '@/features/home/homeModel';
import {
  StyleSheet
} from 'react-native';
export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: HOME_COLORS.surface,
  },
  mapVeil: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(250,248,244,0.18)',
  }
});
