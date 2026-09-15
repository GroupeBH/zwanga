import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from "@/constants/styles";
import { StyleSheet } from "react-native";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: Spacing.md,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    backgroundColor: Colors.gray[300],
    borderRadius: BorderRadius.full,
    marginRight: Spacing.md,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    fontSize: FontSizes.base,
    marginBottom: Spacing.xs,
  },
  userStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  onlineDot: {
    width: 8,
    height: 8,
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    marginRight: Spacing.xs,
  },
  userStatusText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  headerButton: {
    width: 40,
    height: 40,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
  },
  keyboardView: {
    flex: 1,
  },
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  loadingContainer: {
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateSeparator: {
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  dateBadge: {
    backgroundColor: Colors.gray[200],
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
  },
  dateText: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  messageRow: {
    width: '100%',
    marginBottom: Spacing.md,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  messageRowMe: {
    justifyContent: 'flex-end',
    paddingLeft: Spacing.xl,
    paddingRight: Spacing.xs,
  },
  messageRowOther: {
    justifyContent: 'flex-start',
    paddingRight: Spacing.xl,
    paddingLeft: Spacing.xs,
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.xl,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
  },
  messageBubbleMe: {
    backgroundColor: Colors.primary,
    borderBottomLeftRadius: BorderRadius.md,
  },
  messageBubbleOther: {
    backgroundColor: Colors.gray[100],
    borderBottomRightRadius: BorderRadius.md,
    ...CommonStyles.shadowSm,
  },
  messageText: {
    color: Colors.gray[800],
    fontSize: FontSizes.base,
  },
  messageTextMe: {
    color: Colors.white,
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: Spacing.xs,
  },
  messageTime: {
    fontSize: FontSizes.xs,
    color: Colors.gray[500],
  },
  messageTimeMe: {
    color: Colors.white,
    opacity: 0.7,
  },
  checkIcon: {
    marginLeft: Spacing.xs,
    opacity: 0.7,
  },
  inputContainer: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputButton: {
    width: 40,
    height: 40,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
  },
  emojiButton: {
    marginLeft: Spacing.sm,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Spacing.sm,
    backgroundColor: Colors.gray[100],
  },
  sendButtonActive: {
    backgroundColor: Colors.primary,
  }
});
