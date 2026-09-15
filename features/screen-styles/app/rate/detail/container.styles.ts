import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  closeButton: {
    marginRight: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.sm,
  },
  tabActive: {
    backgroundColor: Colors.white,
  },
  tabText: {
    textAlign: 'center',
    fontWeight: FontWeights.semibold,
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  tabTextActive: {
    color: Colors.primary,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing.xxl,
  },
  driverCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    marginBottom: Spacing.xl,
    ...CommonStyles.shadowSm,
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverAvatar: {
    width: 64,
    height: 64,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
    marginRight: Spacing.lg,
  },
  driverDetails: {
    flex: 1,
  },
  driverName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.lg,
    marginBottom: Spacing.xs,
  },
  driverMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  driverMetaText: {
    color: Colors.gray[600],
    marginLeft: Spacing.xs,
    fontSize: FontSizes.base,
  },
  passengerChips: {
    marginTop: Spacing.md,
  },
  passengerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    marginRight: Spacing.sm,
    backgroundColor: Colors.white,
  },
  passengerChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  passengerChipText: {
    marginLeft: Spacing.xs,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  passengerChipTextActive: {
    color: Colors.white,
  },
  emptyPassengerText: {
    color: Colors.gray[500],
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },
  loadingContainer: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.gray[100],
    borderWidth: 1,
    borderColor: Colors.gray[300],
    marginTop: Spacing.sm,
  },
  retryButtonText: {
    marginLeft: Spacing.xs,
    color: Colors.primary,
    fontWeight: FontWeights.medium,
    fontSize: FontSizes.sm,
  },
  driverTrip: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  targetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    borderWidth: 2,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  targetOptionActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  targetOptionContent: {
    flex: 1,
    marginLeft: Spacing.md,
  },
  targetOptionText: {
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
    marginBottom: Spacing.xs,
  },
  targetOptionTextActive: {
    color: Colors.white,
  },
  targetOptionSubtext: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  targetOptionSubtextActive: {
    color: Colors.white,
    opacity: 0.9,
  },
  ratingContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  ratingTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.lg,
  },
  starsContainer: {
    flexDirection: 'row',
  },
  starButton: {
    padding: Spacing.sm,
    marginHorizontal: Spacing.xs,
  },
  ratingText: {
    color: Colors.gray[600],
    marginTop: Spacing.sm,
    fontSize: FontSizes.base,
  },
  tagsContainer: {
    marginBottom: Spacing.xl,
  },
  tagsTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
    marginBottom: Spacing.md,
  },
  tagsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
  },
  tagActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  tagText: {
    marginLeft: Spacing.sm,
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
  },
  tagTextActive: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
  commentContainer: {
    marginBottom: Spacing.xl,
  },
  commentTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  commentInput: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    padding: Spacing.lg,
    minHeight: 100,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  commentCounter: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
    marginTop: Spacing.xs,
    textAlign: 'right',
  },
  dropSection: {
    marginBottom: Spacing.lg,
  },
  dropLabel: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  submitButton: {
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xxl,
    minHeight: 56,
  },
  submitButtonActive: {
    backgroundColor: Colors.primary,
  },
  submitButtonDanger: {
    backgroundColor: Colors.danger,
  }
});
