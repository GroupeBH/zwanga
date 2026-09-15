import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  priceSuggestionsContainer: {
    marginBottom: Spacing.sm,
  },
  priceSuggestionsLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    marginBottom: Spacing.xs,
  },
  priceSuggestions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  priceSuggestionButton: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  priceSuggestionButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  priceSuggestionText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  priceSuggestionTextActive: {
    color: Colors.white,
  },
  inputError: {
    borderColor: Colors.danger,
    backgroundColor: Colors.danger + '05',
  },
  errorText: {
    fontSize: FontSizes.xs,
    color: Colors.danger,
    marginTop: Spacing.xs,
  },
  priceComparisonContainer: {
    marginTop: Spacing.sm,
  },
  priceComparisonBar: {
    height: 6,
    backgroundColor: Colors.gray[200],
    borderRadius: BorderRadius.sm,
    overflow: 'hidden',
    marginBottom: Spacing.xs,
  },
  priceComparisonFill: {
    height: '100%',
    borderRadius: BorderRadius.sm,
  },
  priceComparisonText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  seatsSuggestionsContainer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  seatsSuggestionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
  },
  seatsSuggestionButtonActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  seatsSuggestionText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  seatsSuggestionTextActive: {
    color: Colors.white,
  },
  offerSummary: {
    backgroundColor: Colors.primary + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.lg,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.primary + '30',
  },
  offerSummaryTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
  },
  offerSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  offerSummaryText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  offerSummaryTotal: {
    fontWeight: FontWeights.bold,
    color: Colors.primary,
    fontSize: FontSizes.base,
  },
  formActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  cancelFormButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  cancelFormButtonText: {
    fontSize: FontSizes.base,
    color: Colors.gray[700],
    fontWeight: FontWeights.medium,
  },
  submitButton: {
    flex: 1,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  submitButtonDisabled: {
    backgroundColor: Colors.gray[400],
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: FontSizes.base,
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalKeyboardView: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    maxHeight: '100%',
    minHeight: '95%',
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 10,
  },
  modalContentInner: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  modalCloseButton: {
    padding: Spacing.xs,
  },
  modalScrollView: {
    flexGrow: 1,
  },
  modalScrollContent: {
    padding: Spacing.lg,
    flexGrow: 1,
  },
  modalConfirmButton: {
    padding: Spacing.md,
    backgroundColor: Colors.primary,
    margin: Spacing.md,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
  },
  modalConfirmButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
  },
  emptyTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginTop: Spacing.lg,
  },
  emptyText: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    textAlign: 'center',
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.lg,
  },
  noOffersContainer: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    padding: Spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  noOffersIconContainer: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  noOffersTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  noOffersText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 20,
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    marginTop: Spacing.lg,
    gap: Spacing.sm,
  },
  retryButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  // === MODAL DE MODIFICATION ===
  editModalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  }
});
