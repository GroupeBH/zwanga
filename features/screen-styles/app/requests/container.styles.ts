import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.gray[50] },
  header: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.white,
    paddingHorizontal: Spacing.sm, paddingVertical: Spacing.xs,
  },
  headerButton: { minHeight: 44, width: 44, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { flex: 1, fontSize: FontSizes.lg, fontWeight: FontWeights.bold, color: Colors.gray[900], marginRight: Spacing.lg },
  toolbar: { backgroundColor: Colors.white, paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md },
  tabsContainer: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: Colors.gray[200] },
  tab: { flex: 1, minHeight: 48, paddingVertical: Spacing.sm, paddingHorizontal: Spacing.xs, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { color: Colors.gray[600], fontSize: FontSizes.sm, fontWeight: FontWeights.medium, textAlign: 'center' },
  tabTextActive: { color: Colors.primary, fontWeight: FontWeights.bold },
  contextText: { color: Colors.gray[600], fontSize: FontSizes.xs, lineHeight: 18, marginVertical: Spacing.sm },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray[50], borderRadius: BorderRadius.lg, borderWidth: 1, borderColor: Colors.gray[200], paddingLeft: Spacing.md },
  searchInput: { flex: 1, minWidth: 0, minHeight: 46, color: Colors.gray[900], fontSize: FontSizes.sm, paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
  clearButton: { minHeight: 44, width: 44, alignItems: 'center', justifyContent: 'center' },
  list: { flex: 1 },
  listContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.lg },
  emptyListContent: { flexGrow: 1 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  resultsCopy: { flex: 1 },
  resultsCount: { color: Colors.gray[900], fontSize: FontSizes.sm, fontWeight: FontWeights.semibold },
  resultsHint: { color: Colors.gray[600], fontSize: FontSizes.xs, marginTop: 2 },
  errorNotice: { paddingVertical: Spacing.sm, marginBottom: Spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: Colors.gray[200] },
  errorText: { color: Colors.gray[700], fontSize: FontSizes.sm, lineHeight: 20 },
  footer: { backgroundColor: Colors.white, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: Colors.gray[200], paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm },
  createButton: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, backgroundColor: Colors.primary, borderRadius: BorderRadius.lg, padding: Spacing.md },
  createButtonText: { color: Colors.white, fontSize: FontSizes.base, fontWeight: FontWeights.semibold, flexShrink: 1, textAlign: 'center' },
});
