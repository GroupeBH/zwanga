import { StyleSheet } from "react-native";
import { AUTH_SURFACE, AUTH_WARM_BORDER, AUTH_MUTED_TEXT } from '@/features/auth/authColors';
import { Colors, FontSizes, FontWeights, Spacing } from "@/constants/styles";

export const styles = StyleSheet.create({
  vehicleDetailsSheet: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AUTH_SURFACE,
    minHeight: 52,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: 14,
    marginTop: Spacing.sm,
    borderWidth: 1,
    borderColor: AUTH_WARM_BORDER,
  },
  vehicleDetailsInfo: {
    flex: 1,
  },
  vehicleDetailsTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  vehicleDetailsSubtitle: {
    fontSize: FontSizes.sm,
    color: AUTH_MUTED_TEXT,
    marginTop: 2,
  },
  profileContinueButton: {
    height: 52,
    marginTop: Spacing.md,
    marginBottom: 0,
  },
  // KYC
  kycBenefitsContainer: {
    gap: Spacing.md,
    marginVertical: Spacing.xl,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: AUTH_SURFACE,
    padding: Spacing.lg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: AUTH_WARM_BORDER,
  },
  benefitText: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  kycIdentityCard: {
    gap: Spacing.xs,
    padding: Spacing.lg,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: `${Colors.primary}35`,
    backgroundColor: `${Colors.primary}08`,
  },
  kycIdentityEyebrow: {
    color: Colors.primaryDark,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    letterSpacing: 0.7,
    marginBottom: Spacing.xs,
  },
  kycIdentityLabel: {
    color: AUTH_MUTED_TEXT,
    fontSize: FontSizes.xs,
  },
  kycIdentityValue: {
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.xs,
  },
  kycIdentityHint: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    lineHeight: 19,
    marginTop: Spacing.xs,
  },
  kycIdentityEditButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.xs,
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  kycIdentityEditText: {
    color: Colors.primary,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17,24,39,0.42)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: AUTH_SURFACE,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    padding: Spacing.xl,
    minHeight: '60%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  modalTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  // Resend OTP
  resendContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.lg,
  },
  resendText: {
    fontSize: FontSizes.sm,
    color: AUTH_MUTED_TEXT,
  },
  resendLink: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.primaryDark,
  }
});
