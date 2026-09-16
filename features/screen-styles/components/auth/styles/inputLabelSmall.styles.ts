import { StyleSheet } from "react-native";
import { AUTH_SURFACE, AUTH_WARM_SURFACE, AUTH_WARM_BORDER, AUTH_MUTED_TEXT } from '@/features/auth/authColors';
import { Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";

export const styles = StyleSheet.create({
  inputLabelSmall: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: AUTH_MUTED_TEXT,
    marginBottom: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: AUTH_WARM_BORDER,
    borderRadius: 18,
    paddingHorizontal: Spacing.lg,
    backgroundColor: AUTH_SURFACE,
    height: 58,
    marginBottom: Spacing.sm,
  },
  inputIcon: {
    marginRight: Spacing.md,
  },
  input: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    height: '100%',
  },
  rowInputs: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  // Buttons
  mainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 56,
    borderRadius: 18,
    gap: Spacing.sm,
  },
  mainButtonActive: {
    backgroundColor: Colors.primaryDark,
    shadowColor: Colors.primaryDark,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  mainButtonDisabled: {
    backgroundColor: '#EAD9D2',
    shadowOpacity: 0,
  },
  mainButtonText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  resendButton: {
    alignSelf: 'center',
    marginTop: Spacing.lg,
  },
  resendButtonText: {
    color: Colors.primaryDark,
    fontWeight: FontWeights.semibold,
  },
  forgotPinButton: {
    alignSelf: 'center',
    marginTop: Spacing.xl,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  forgotPinText: {
    color: Colors.primaryDark,
    fontWeight: FontWeights.medium,
    fontSize: FontSizes.lg,
  },
  secondaryButton: {
    height: 52,
    borderRadius: 16,
    backgroundColor: AUTH_SURFACE,
    borderWidth: 1,
    borderColor: AUTH_WARM_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  secondaryButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.primaryDark,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginVertical: Spacing.md,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: AUTH_WARM_BORDER,
  },
  dividerText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
    color: AUTH_MUTED_TEXT,
  },
  legalText: {
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: AUTH_MUTED_TEXT,
    paddingHorizontal: Spacing.sm,
  },
  legalLink: {
    color: Colors.primaryDark,
    fontWeight: FontWeights.bold,
  },
  // Social auth
  googleButton: {
    height: 54,
    borderRadius: 18,
    borderWidth: 1.3,
    borderColor: AUTH_WARM_BORDER,
    backgroundColor: AUTH_SURFACE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  googleIcon: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
  },
  googleButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  appleButton: {
    marginTop: Spacing.sm,
    width: '100%',
    height: 52,
  },
  appleButtonLoading: {
    marginTop: Spacing.sm,
    height: 56,
    borderRadius: 18,
    borderWidth: 1.3,
    borderColor: Colors.gray[900],
    backgroundColor: AUTH_SURFACE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  appleButtonLoadingText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  appleFallbackButton: {
    marginTop: Spacing.sm,
    height: 56,
    borderRadius: 18,
    borderWidth: 1.3,
    borderColor: Colors.gray[900],
    backgroundColor: AUTH_SURFACE,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  appleFallbackButtonText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  googleSignupCard: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: 18,
    backgroundColor: AUTH_WARM_SURFACE,
    borderWidth: 1,
    borderColor: AUTH_WARM_BORDER,
    gap: Spacing.md,
  },
  googleSignupTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  googleSignupSubtitle: {
    fontSize: FontSizes.sm,
    color: AUTH_MUTED_TEXT,
  },
  // SMS / OTP
  smsCodeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: Spacing.xl,
  },
  smsInput: {
    width: 52,
    height: 60,
    borderWidth: 1.8,
    borderColor: AUTH_WARM_BORDER,
    borderRadius: 16,
    textAlign: 'center',
    fontSize: 23,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    backgroundColor: AUTH_SURFACE,
  },
  smsInputFilled: {
    borderColor: Colors.primary,
    backgroundColor: AUTH_WARM_SURFACE,
  },
  // PIN
  pinSignupStepContainer: {
    paddingBottom: Spacing.md,
  },
  pinHeroSection: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.lg,
  },
  pinHeroSectionCompact: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  pinSignupTitle: {
    fontSize: FontSizes.xxl,
    marginBottom: Spacing.xs,
  },
  pinSignupSubtitle: {
    fontSize: FontSizes.sm,
    lineHeight: 20,
    paddingHorizontal: Spacing.sm,
  },
  pinSignupForm: {
    gap: Spacing.md,
  },
  pinSignupField: {
    gap: Spacing.xs,
    marginTop: 0,
  },
  pinSignupLabel: {
    marginBottom: 0,
  },
  pinSignupButton: {
    height: 52,
    marginTop: Spacing.xs,
  },
  pinCodeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.lg,
    marginTop: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  pinCodeContainerCompact: {
    gap: Spacing.md,
    marginTop: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  pinInput: {
    width: 60,
    height: 68,
    borderWidth: 2,
    borderColor: AUTH_WARM_BORDER,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AUTH_SURFACE,
  },
  pinInputCompact: {
    width: 52,
    height: 56,
    borderRadius: 16,
  },
  pinInputFilled: {
    borderColor: Colors.primary,
    backgroundColor: AUTH_WARM_SURFACE,
  }
});
