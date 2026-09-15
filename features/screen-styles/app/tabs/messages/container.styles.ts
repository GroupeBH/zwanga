import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";
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
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  addButton: {
    width: 40,
    height: 40,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  searchInput: {
    flex: 1,
    marginLeft: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
    paddingBottom: 120, // Increased for edge-to-edge
  },
  conversationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  loadingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.gray[100],
  },
  loadingText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xxl * 2,
  },
  emptyIcon: {
    width: 96,
    height: 96,
    backgroundColor: Colors.gray[200],
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  emptyTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.sm,
  },
  emptyText: {
    color: Colors.gray[600],
    textAlign: 'center',
    fontSize: FontSizes.base,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
    flex: 1,
  },
  avatarContainer: {
    position: 'relative',
    marginRight: Spacing.md,
  },
  avatar: {
    width: 56,
    height: 56,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.white,
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.xs,
  },
  conversationName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    flex: 1,
    fontSize: FontSizes.base,
  },
  conversationTime: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  conversationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  conversationMessage: {
    flex: 1,
    color: Colors.gray[600],
    fontSize: FontSizes.base,
  },
  conversationMessageUnread: {
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
  },
  unreadBadge: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  unreadBadgeText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  deleteConversationButton: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  }
});
