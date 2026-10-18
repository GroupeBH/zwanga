import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { HOME_COLORS } from '@/features/home/homeModel';
import {
  StyleSheet
} from 'react-native';
export const styles = StyleSheet.create({
  sheetLoadingState: {
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
    overflow: 'hidden',
  },
  sheetLoadingTitle: {
    color: HOME_COLORS.ink,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  sheetLoadingPreview: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
  },
  sheetLoadingShimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 68,
    backgroundColor: 'rgba(255,255,255,0.58)',
  },
  sheetLoadingPreviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetLoadingAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.gray[100],
    marginRight: Spacing.sm,
  },
  sheetLoadingLines: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  sheetLoadingLineStrong: {
    width: '72%',
    height: 11,
    borderRadius: 999,
    backgroundColor: '#DDE5EA',
  },
  sheetLoadingLineSoft: {
    width: '44%',
    height: 9,
    borderRadius: 999,
    backgroundColor: '#E9EEF2',
  },
  sheetLoadingRouteRow: {
    marginTop: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  sheetLoadingRouteDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 4,
    borderColor: HOME_COLORS.success,
    backgroundColor: Colors.white,
  },
  sheetLoadingRouteDotEnd: {
    borderColor: Colors.primary,
  },
  sheetLoadingRouteLine: {
    flex: 1,
    height: 2,
    marginHorizontal: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(75,45,40,0.24)',
  }
});
