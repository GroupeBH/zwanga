import { StyleSheet } from 'react-native';
import { Spacing } from '@/constants/styles';

export const historyStyles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
});
