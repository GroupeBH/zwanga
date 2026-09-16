import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingBottom: Spacing.xxl,
  },
  summaryBand: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  summaryLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    fontWeight: FontWeights.medium,
  },
  summaryValue: {
    marginTop: Spacing.xs,
    fontSize: FontSizes.xxl,
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
  },
  filters: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    gap: Spacing.sm,
  },
  filterButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  filterButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterText: {
    color: Colors.gray[700],
    fontWeight: FontWeights.semibold,
    fontSize: FontSizes.sm,
  },
  filterTextActive: {
    color: Colors.white,
  },
  paymentList: {
    backgroundColor: Colors.white,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.gray[100],
  },
  paymentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    gap: Spacing.md,
  },
  paymentMain: {
    flex: 1,
    minWidth: 0,
  },
  paymentTopLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
  },
  paymentTitle: {
    flex: 1,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
  paymentAmount: {
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  paymentMetaLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  statusBadge: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  paymentMetaText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  referenceText: {
    marginTop: Spacing.sm,
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
  },
  paymentMessage: {
    marginTop: Spacing.xs,
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
  },
  paymentDetailHint: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.xs,
  },
  paymentDetailHintText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  downloadButton: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.xxl * 2,
    gap: Spacing.sm,
  },
  stateTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  stateText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    textAlign: 'center',
  },
  detailOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  detailSheet: {
    maxHeight: '88%',
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  detailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  detailHeaderText: {
    flex: 1,
    minWidth: 0,
  },
  detailTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  detailSubtitle: {
    marginTop: 2,
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
  },
  detailCloseButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.md,
  },
  detailContent: {
    maxHeight: 520,
  },
  detailContentInner: {
    paddingBottom: Spacing.lg,
  },
  detailSummary: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  detailSummaryLabel: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  detailSummaryAmount: {
    marginTop: Spacing.xs,
    color: Colors.gray[900],
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
  },
  detailStatusBadge: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  detailStatusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  detailRows: {
    paddingHorizontal: Spacing.xl,
  },
  detailRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  detailRowLabel: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  detailRowValue: {
    marginTop: 4,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.medium,
  },
  detailActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    gap: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  }
});
