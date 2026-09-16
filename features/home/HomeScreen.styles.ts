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
    backgroundColor: 'rgba(248,249,250,0.12)',
  }
});
