import { Platform, StyleSheet } from "react-native";
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";

export const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 1000,
  },
  touchable: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: Colors.primary + '24',
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.12,
        shadowRadius: 18,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  gradient: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  accentRail: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 5,
    backgroundColor: Colors.primary,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: Spacing.lg + Spacing.xs,
    paddingRight: Spacing.md,
    paddingVertical: Spacing.md,
  },
  iconWrapper: {
    position: 'relative',
    marginRight: Spacing.md,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  textContainer: {
    flex: 1,
    minWidth: 0,
    marginRight: Spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.xs,
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    flexShrink: 1,
    letterSpacing: 0,
  },
  statusBadge: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  statusBadgeText: {
    fontSize: FontSizes.xs - 1,
    fontWeight: FontWeights.semibold,
    textTransform: 'uppercase',
    letterSpacing: 0,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  routeIcon: {
    marginRight: Spacing.xs,
  },
  routeDot: {
    width: 7,
    height: 7,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    marginRight: Spacing.xs + 1,
  },
  routeText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[800],
    flex: 1,
    fontWeight: FontWeights.medium,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xs,
  },
  timeText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
  },
  chevronContainer: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.primary + '20',
  }
});
