import { StyleSheet } from 'react-native';
import { BorderRadius, Colors, Spacing } from '@/constants/styles';

export const authStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.white },

  // Header
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.sm },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.lg },
  backButton: { padding: Spacing.xs },

  toggleContainer: { flexDirection: 'row', backgroundColor: '#F3F4F6', borderRadius: BorderRadius.full, padding: 4 },
  toggleButton: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: BorderRadius.full },
  toggleButtonActive: { backgroundColor: Colors.white, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, elevation: 2 },
  toggleText: { fontSize: 14, fontWeight: '600', color: Colors.gray[500] },
  toggleTextActive: { color: Colors.primary },

  progressContainer: { alignItems: 'center', marginBottom: Spacing.sm },
  progressBarBg: { width: '100%', height: 4, backgroundColor: '#E5E7EB', borderRadius: BorderRadius.full },
  progressBarFill: { height: '100%', backgroundColor: Colors.primary, borderRadius: BorderRadius.full },
  motivationalText: { textAlign: 'center', color: Colors.primary, fontSize: 12, fontWeight: '600', marginTop: 4 },

  scrollView: { flex: 1 },
  scrollViewContent: { paddingHorizontal: Spacing.xl, paddingBottom: 40, flexGrow: 1 },

  stepContainer: { flex: 1 },

  // Hero Section
  heroSection: { alignItems: 'center', marginVertical: Spacing.xl },
  heroSectionCompact: { alignItems: 'center', marginVertical: Spacing.md },
  logoContainer: { width: 80, height: 80, borderRadius: 25, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', marginBottom: Spacing.md },
  heroTitle: { fontSize: 28, fontWeight: '800', color: Colors.gray[900], marginBottom: 4, textAlign: 'center' },
  heroSubtitle: { fontSize: 16, color: Colors.gray[500], textAlign: 'center', paddingHorizontal: 20 },

  // Forms
  formSection: { gap: Spacing.lg, marginTop: Spacing.lg },
  inputLabel: { fontSize: 14, fontWeight: '600', color: Colors.gray[700], marginBottom: 8 },
  inputLabelSmall: { fontSize: 12, fontWeight: '600', color: Colors.gray[600], marginBottom: 4 },
  inputWrapper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 16, paddingHorizontal: 16, backgroundColor: '#F9FAFB', height: 56, marginBottom: 12 },
  inputIcon: { marginRight: 12 },
  input: { flex: 1, fontSize: 16, color: Colors.gray[900], height: '100%' },
  rowInputs: { flexDirection: 'row', gap: 12 },

  // Buttons
  mainButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: 56, borderRadius: 16, gap: 8, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  mainButtonActive: { backgroundColor: Colors.primary },
  mainButtonDisabled: { backgroundColor: Colors.gray[300], shadowOpacity: 0 },
  mainButtonText: { fontSize: 18, fontWeight: '700', color: 'white' },
  resendButton: { alignSelf: 'center', marginTop: 16 },
  resendButtonText: { color: Colors.primary, fontWeight: '600' },
  forgotPinButton: { alignSelf: 'center', marginTop: 16 },
  forgotPinText: { color: Colors.gray[600], fontWeight: '600', fontSize: 14, textDecorationLine: 'underline' },

  secondaryButton: {
    height: 48,
    borderRadius: 12,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.primary,
  },

  // Google auth
  googleButton: {
    marginTop: Spacing.md,
    height: 52,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.gray[300],
    backgroundColor: Colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.gray[700],
  },
  googleSignupCard: {
    marginTop: Spacing.lg,
    padding: Spacing.md,
    borderRadius: 16,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: Spacing.md,
  },
  googleSignupTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.gray[800],
  },
  googleSignupSubtitle: {
    fontSize: 14,
    color: Colors.gray[600],
  },

  // SMS / OTP
  smsCodeContainer: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 32 },
  smsInput: { width: 48, height: 60, borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, textAlign: 'center', fontSize: 24, fontWeight: 'bold', color: Colors.gray[900], backgroundColor: '#F9FAFB' },
  smsInputFilled: { borderColor: Colors.primary, backgroundColor: 'white' },
  
  // PIN styles
  pinCodeContainer: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginVertical: 24 },
  pinInput: { width: 56, height: 64, borderWidth: 2, borderColor: '#D1D5DB', borderRadius: 16, textAlign: 'center', fontSize: 28, fontWeight: 'bold', color: Colors.gray[900], backgroundColor: '#F3F4F6' },
  pinInputFilled: { borderColor: Colors.secondary, backgroundColor: '#F0F9FF', borderWidth: 2.5 },
  
  pinInputWrapper: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    borderWidth: 1.5, 
    borderColor: '#E5E7EB', 
    borderRadius: 12, 
    paddingHorizontal: 12, 
    backgroundColor: '#F9FAFB', 
    height: 48, 
    marginBottom: 12,
    alignSelf: 'center',
    width: 160,
    justifyContent: 'center',
  },
  pinInputIcon: { marginRight: 8 },
  pinInputField: { 
    flex: 1, 
    fontSize: 20, 
    fontWeight: '600',
    color: Colors.gray[900], 
    height: '100%',
    textAlign: 'center',
    letterSpacing: 8,
  },

  // Profile
  profileHeader: { alignItems: 'center', marginBottom: 24 },
  avatarUpload: { position: 'relative' },
  avatarPlaceholder: { width: 100, height: 100, borderRadius: 40, backgroundColor: Colors.primary + '15', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'white', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
  avatarImage: { width: 100, height: 100, borderRadius: 40, borderWidth: 3, borderColor: 'white' },
  editBadge: { position: 'absolute', bottom: -4, right: -4, backgroundColor: Colors.primary, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'white' },

  formGrid: { gap: 12 },

  // Roles
  sectionLabel: { fontSize: 16, fontWeight: '700', color: Colors.gray[800], marginBottom: 12, marginTop: 8 },
  roleSelection: { marginTop: 16 },
  roleCards: { flexDirection: 'row', gap: 16 },
  roleCard: { flex: 1, backgroundColor: 'white', borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 20, padding: 16, alignItems: 'center', gap: 12 },
  roleCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '05' },
  roleIconBadge: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  roleLabel: { fontSize: 14, fontWeight: '600', color: Colors.gray[600] },
  roleLabelActive: { color: Colors.primary, fontWeight: '700' },

  // Vehicle
  vehicleSection: { marginTop: 24 },
  vehicleTypesScroll: { paddingVertical: 8, gap: 12 },
  vehicleTypeCard: { alignItems: 'center', justifyContent: 'center', width: 90, height: 90, borderRadius: 16, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: 'white', gap: 8 },
  vehicleTypeCardActive: { borderColor: Colors.primary, backgroundColor: Colors.primary + '05' },
  vehicleTypeLabel: { fontSize: 12, fontWeight: '600', color: Colors.gray[500] },
  vehicleTypeLabelActive: { color: Colors.primary },

  vehicleDetailsSheet: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16, marginTop: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  vehicleDetailsInfo: { flex: 1 },
  vehicleDetailsTitle: { fontSize: 16, fontWeight: '700', color: Colors.gray[900] },
  vehicleDetailsSubtitle: { fontSize: 14, color: Colors.gray[500], marginTop: 2 },

  // KYC Screen
  kycBenefitsContainer: { gap: 16, marginVertical: 32, paddingHorizontal: 16 },
  benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 16, backgroundColor: '#F9FAFB', padding: 16, borderRadius: 16 },
  benefitText: { fontSize: 15, fontWeight: '600', color: Colors.gray[800] },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: 'white', borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: 24, minHeight: '60%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  modalTitle: { fontSize: 20, fontWeight: 'bold' },

  // Resend OTP
  resendContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 16 },
  resendText: { fontSize: 14, color: Colors.gray[500] },
  resendLink: { fontSize: 14, fontWeight: '600', color: Colors.primary },
});

