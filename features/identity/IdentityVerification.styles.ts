import { StyleSheet } from 'react-native';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, CommonStyles } from '@/constants/styles';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: Spacing.xxl,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  iconCircleBlue: {
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
  },
  iconCircleGreen: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
  },
  iconCircleSuccess: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
  },
  stepTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  stepSubtitle: {
    color: Colors.gray[600],
    textAlign: 'center',
    fontSize: FontSizes.base,
    paddingHorizontal: Spacing.lg,
  },
  scanButton: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.xl,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.md,
    ...CommonStyles.shadowMd,
  },
  scanButtonText: {
    color: Colors.white,
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  imagePreviewContainer: {
    marginVertical: Spacing.lg,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
    position: 'relative',
  },
  imagePreview: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  facePreview: {
    width: 200,
    height: 200,
    borderRadius: BorderRadius.full,
    alignSelf: 'center',
    resizeMode: 'cover',
  },
  processingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  processingText: {
    color: Colors.white,
    marginTop: Spacing.md,
    fontSize: FontSizes.base,
  },
  retakeButton: {
    backgroundColor: Colors.gray[700],
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    alignSelf: 'center',
  },
  retakeText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.medium,
  },
  skipButton: {
    paddingVertical: Spacing.md,
    marginTop: Spacing.lg,
  },
  skipText: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
});
