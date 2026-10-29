import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { HOME_COLORS } from '@/features/home/homeModel';
import { HOME_DASHBOARD_COLORS } from '@/features/home/homeDashboardTheme';
import {
  StyleSheet
} from 'react-native';
export const styles = StyleSheet.create({
  mapViewport: { position: 'absolute', top: 0, left: 0, right: 0, overflow: 'hidden', backgroundColor: '#EDF0EA' },
  map: {
    ...StyleSheet.absoluteFillObject,
  },
  locationLegend: {
    position: 'absolute', left: 16, bottom: 68, maxWidth: '72%',
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    backgroundColor: Colors.white,
  },
  locationLegendDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: HOME_DASHBOARD_COLORS.positionOrange },
  locationLegendPendingDot: { backgroundColor: Colors.gray[500] },
  locationLegendText: { flexShrink: 1, color: HOME_DASHBOARD_COLORS.ink, fontSize: 12, fontWeight: '600' },
  locationLegendSummary: { flexShrink: 1, color: HOME_DASHBOARD_COLORS.ink, fontSize: 12, fontWeight: '700' },
  userLocationCallout: {
    width: 236,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: HOME_COLORS.softLine,
    ...CommonStyles.shadowMd,
  },
  userLocationCalloutTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  userLocationCalloutIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: HOME_COLORS.navy,
  },
  userLocationCalloutTitle: {
    flex: 1,
    color: HOME_COLORS.ink,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  userLocationCalloutAddress: {
    marginTop: Spacing.sm,
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    lineHeight: 19,
    fontWeight: FontWeights.medium,
  }
});
