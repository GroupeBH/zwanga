import { StyleSheet } from 'react-native';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';

const AUTH_SURFACE = '#FFFFFF';
const AUTH_BACKGROUND = '#F6F8FA';
const AUTH_WARM_SURFACE = '#FFF8F4';
const AUTH_WARM_BORDER = '#E9C8BD';
const AUTH_MUTED_TEXT = '#596276';

export const authStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AUTH_BACKGROUND,
  },

  // Header
  header: {
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: 0,
  },
  headerTop: {
    minHeight: 44,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTopCentered: {
    justifyContent: 'center',
  },
  backButton: {
    position: 'absolute',
    left: 0,
    width: 42,
    height: 42,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBrand: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.primaryDark,
    textAlign: 'center',
  },

  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: AUTH_SURFACE,
    borderRadius: BorderRadius.full,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.primary + '18',
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  toggleButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
  },
  toggleButtonActive: {
    backgroundColor: AUTH_WARM_SURFACE,
  },
  toggleText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[500],
  },
  toggleTextActive: {
    color: Colors.primaryDark,
  },

  progressContainer: {
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  progressBarBg: {
    width: '100%',
    height: 4,
    backgroundColor: Colors.gray[200],
    borderRadius: BorderRadius.full,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
  },
  motivationalText: {
    textAlign: 'center',
    color: AUTH_MUTED_TEXT,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    marginTop: 6,
  },

  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    flexGrow: 1,
  },

  stepContainer: {
    flex: 1,
  },
  phoneStepContainer: {
    paddingBottom: Spacing.md,
  },

  // Brand / hero
  brandHero: {
    alignItems: 'center',
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  brandIcon: {
    width: 48,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  brandName: {
    fontSize: 38,
    fontWeight: FontWeights.bold,
    color: Colors.primaryDark,
  },
  introBlock: {
    marginTop: 0,
    marginBottom: Spacing.lg,
  },
  introTitle: {
    fontSize: 28,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.xs,
  },
  introSubtitle: {
    fontSize: FontSizes.base,
    color: AUTH_MUTED_TEXT,
    lineHeight: 23,
  },
  heroSection: {
    alignItems: 'center',
    marginTop: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  heroSectionCompact: {
    alignItems: 'center',
    marginTop: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  logoContainer: {
    width: 92,
    height: 92,
    borderRadius: 30,
    backgroundColor: Colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.primary + '18',
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: FontSizes.base,
    color: AUTH_MUTED_TEXT,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: Spacing.md,
  },
  secureIllustration: {
    width: 168,
    height: 168,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
  },
  secureIllustrationCompact: {
    width: 88,
    height: 88,
    marginBottom: Spacing.sm,
  },
  secureRing: {
    position: 'absolute',
    width: 142,
    height: 142,
    borderRadius: BorderRadius.full,
    borderWidth: 6,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  secureRingCompact: {
    width: 76,
    height: 76,
    borderWidth: 4,
  },
  secureConnector: {
    position: 'absolute',
    width: 118,
    height: 24,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
  },
  secureConnectorCompact: {
    width: 62,
    height: 14,
  },
  secureTile: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 22,
    elevation: 6,
  },
  secureTileCompact: {
    width: 56,
    height: 56,
    borderRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 12,
    elevation: 3,
  },

  // Forms
  formSection: {
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  authCard: {
    backgroundColor: AUTH_SURFACE,
    borderRadius: BorderRadius.xxl,
    borderWidth: 1,
    borderColor: AUTH_WARM_BORDER,
    padding: Spacing.lg,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  inputLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: '#604238',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
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
  phoneInputShell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: AUTH_WARM_BORDER,
    borderRadius: 18,
    backgroundColor: AUTH_SURFACE,
    height: 56,
    marginBottom: Spacing.md,
    overflow: 'hidden',
  },
  countryPrefix: {
    height: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    borderRightWidth: 1,
    borderRightColor: AUTH_WARM_BORDER,
    backgroundColor: Colors.gray[50],
    gap: Spacing.sm,
  },
  countryPrefixText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  phoneTextInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: Spacing.lg,
    fontSize: FontSizes.lg,
    color: Colors.gray[900],
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
  },
  pinEntryContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinHiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  pinDot: {
    fontSize: 28,
    fontWeight: FontWeights.bold,
    lineHeight: 34,
    textAlign: 'center',
  },
  pinDotCompact: {
    fontSize: 24,
    lineHeight: 30,
  },
  pinDotEmpty: {
    color: AUTH_WARM_BORDER,
  },
  pinDotFilled: {
    color: Colors.primaryDark,
  },

  pinInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: AUTH_WARM_BORDER,
    borderRadius: 16,
    paddingHorizontal: Spacing.md,
    backgroundColor: AUTH_SURFACE,
    height: 50,
    marginBottom: Spacing.md,
    alignSelf: 'center',
    width: 170,
    justifyContent: 'center',
  },
  pinInputIcon: {
    marginRight: Spacing.sm,
  },
  pinInputField: {
    flex: 1,
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
    height: '100%',
    textAlign: 'center',
  },

  // Profile
  profileHeader: {
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  avatarUpload: {
    position: 'relative',
  },
  avatarPlaceholder: {
    width: 104,
    height: 104,
    borderRadius: 34,
    backgroundColor: AUTH_WARM_SURFACE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AUTH_WARM_BORDER,
    shadowColor: '#111827',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  avatarImage: {
    width: 104,
    height: 104,
    borderRadius: 34,
    borderWidth: 3,
    borderColor: AUTH_SURFACE,
  },
  editBadge: {
    position: 'absolute',
    bottom: -4,
    right: -4,
    backgroundColor: Colors.primaryDark,
    width: 30,
    height: 30,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: AUTH_SURFACE,
  },

  formGrid: {
    gap: Spacing.md,
  },

  // Roles
  sectionLabel: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  roleSelection: {
    marginTop: Spacing.lg,
  },
  roleCards: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  roleCard: {
    flex: 1,
    backgroundColor: AUTH_SURFACE,
    borderWidth: 1.5,
    borderColor: AUTH_WARM_BORDER,
    borderRadius: 20,
    padding: Spacing.lg,
    alignItems: 'center',
    gap: Spacing.md,
  },
  roleCardActive: {
    borderColor: Colors.primary,
    backgroundColor: AUTH_WARM_SURFACE,
  },
  roleIconBadge: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleIconBadgeActive: {
    backgroundColor: Colors.primary,
  },
  roleLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[600],
  },
  roleLabelActive: {
    color: Colors.primaryDark,
    fontWeight: FontWeights.bold,
  },

  // Vehicle
  vehicleSection: {
    marginTop: Spacing.xl,
  },
  vehicleTypesScroll: {
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  vehicleTypeCard: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 92,
    height: 92,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: AUTH_WARM_BORDER,
    backgroundColor: AUTH_SURFACE,
    gap: Spacing.sm,
  },
  vehicleTypeCardActive: {
    borderColor: Colors.primary,
    backgroundColor: AUTH_WARM_SURFACE,
  },
  vehicleTypeLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[500],
  },
  vehicleTypeLabelActive: {
    color: Colors.primaryDark,
  },

  vehicleDetailsSheet: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AUTH_SURFACE,
    padding: Spacing.lg,
    borderRadius: 18,
    marginTop: Spacing.lg,
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
  },
});
