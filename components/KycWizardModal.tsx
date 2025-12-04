import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Accelerometer, type AccelerometerMeasurement } from 'expo-sensors';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

export type KycCaptureKey = 'front' | 'back' | 'selfie';

export interface KycCaptureResult {
  front: string;
  back: string;
  selfie: string;
}

interface KycWizardModalProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (payload: KycCaptureResult) => void;
  isSubmitting: boolean;
  initialValues?: Partial<Record<KycCaptureKey, string | null>>;
}

const DOCUMENT_STEPS: Array<{ key: KycCaptureKey; title: string; description: string }> = [
  {
    key: 'front',
    title: 'Scanner le recto',
    description: 'Cadrez le recto de votre pièce d’identité dans le gabarit lumineux.',
  },
  {
    key: 'back',
    title: 'Scanner le verso',
    description: 'Retournez la pièce puis laissez l’appareil détecter automatiquement.',
  },
  {
    key: 'selfie',
    title: 'Selfie de vérification',
    description: 'Regardez la caméra et centrez votre visage dans le cercle.',
  },
];

const STABILITY_THRESHOLD = 0.045;
const STABILITY_DURATION_MS = 1500;

export function KycWizardModal({
  visible,
  onClose,
  onComplete,
  isSubmitting,
  initialValues,
}: KycWizardModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [captures, setCaptures] = useState<Record<KycCaptureKey, string | null>>({
    front: initialValues?.front ?? null,
    back: initialValues?.back ?? null,
    selfie: initialValues?.selfie ?? null,
  });
  const [isDeviceStable, setIsDeviceStable] = useState(false);
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const stabilityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastMeasurementRef = useRef<AccelerometerMeasurement | null>(null);

  const steps = useMemo(
    () => [
      ...DOCUMENT_STEPS,
      {
        key: 'review' as const,
        title: 'Vérification finale',
        description: 'Confirmez vos documents avant l’envoi.',
      },
    ],
    [],
  );

  const currentStep = steps[currentStepIndex];
  const isReviewStep = currentStep.key === 'review';
  const needsCamera = !isReviewStep;
  const currentCaptureKey = !isReviewStep ? (currentStep.key as KycCaptureKey) : null;
  const currentCaptureValue = currentCaptureKey ? captures[currentCaptureKey] : null;
  const canContinue = isReviewStep
    ? Boolean(captures.front && captures.back && captures.selfie)
    : Boolean(currentCaptureValue);

  useEffect(() => {
    if (visible) {
      setCaptures({
        front: initialValues?.front ?? null,
        back: initialValues?.back ?? null,
        selfie: initialValues?.selfie ?? null,
      });
      setCurrentStepIndex(0);
      setCaptureCountdown(null);
      setIsDeviceStable(false);
    } else {
      cleanupStabilityTracking();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (!visible || !needsCamera || currentCaptureValue) {
      cleanupStabilityTracking();
      return;
    }

    if (!permission?.granted) {
      requestPermission().catch(console.error);
      return;
    }

    Accelerometer.setUpdateInterval(200);
    const subscription = Accelerometer.addListener((measurement) => {
      const prev = lastMeasurementRef.current;
      lastMeasurementRef.current = measurement;
      if (!prev) {
        return;
      }
      const delta =
        Math.abs(measurement.x - prev.x) +
        Math.abs(measurement.y - prev.y) +
        Math.abs(measurement.z - prev.z);
      const isStableNow = delta < STABILITY_THRESHOLD;

      if (isStableNow) {
        if (!stabilityTimerRef.current) {
          stabilityTimerRef.current = setTimeout(() => {
            setIsDeviceStable(true);
          }, STABILITY_DURATION_MS);
        }
      } else {
        if (stabilityTimerRef.current) {
          clearTimeout(stabilityTimerRef.current);
          stabilityTimerRef.current = null;
        }
        if (isDeviceStable) {
          setIsDeviceStable(false);
        }
      }
    });

    return () => {
      subscription.remove();
      cleanupStabilityTracking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, needsCamera, currentCaptureValue, permission?.granted]);

  useEffect(() => {
    if (!needsCamera || currentCaptureValue) {
      setCaptureCountdown(null);
      return;
    }

    if (isDeviceStable && captureCountdown === null) {
      setCaptureCountdown(2);
    } else if (!isDeviceStable && captureCountdown !== null) {
      setCaptureCountdown(null);
    }
  }, [captureCountdown, currentCaptureValue, isDeviceStable, needsCamera]);

  useEffect(() => {
    if (captureCountdown === null) {
      return;
    }
    if (captureCountdown <= 0) {
      autoCapture();
      return;
    }
    const timer = setTimeout(() => {
      setCaptureCountdown((prev) => (prev ?? 1) - 1);
    }, 500);
    return () => clearTimeout(timer);
  }, [captureCountdown]);

  const cleanupStabilityTracking = () => {
    if (stabilityTimerRef.current) {
      clearTimeout(stabilityTimerRef.current);
      stabilityTimerRef.current = null;
    }
    lastMeasurementRef.current = null;
    setIsDeviceStable(false);
    setCaptureCountdown(null);
  };

  const autoCapture = async () => {
    if (!cameraRef.current || isCapturing || !currentCaptureKey) {
      return;
    }
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: false,
        skipProcessing: false,
      });
      if (photo?.uri) {
        setCaptures((prev) => ({
          ...prev,
          [currentCaptureKey]: photo.uri,
        }));
      }
    } catch (error) {
      console.warn('Auto capture failed:', error);
    } finally {
      setIsCapturing(false);
      setIsDeviceStable(false);
      setCaptureCountdown(null);
    }
  };

  const handleContinue = () => {
    if (isReviewStep) {
      onComplete({
        front: captures.front!,
        back: captures.back!,
        selfie: captures.selfie!,
      });
      return;
    }
    setCurrentStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    setCaptureCountdown(null);
    setIsDeviceStable(false);
  };

  const handleGoBack = () => {
    if (currentStepIndex === 0) {
      onClose();
      return;
    }
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
    setCaptureCountdown(null);
    setIsDeviceStable(false);
  };

  const handleRetake = (key: KycCaptureKey) => {
    setCaptures((prev) => ({
      ...prev,
      [key]: null,
    }));
    if (currentCaptureKey === key) {
      setIsDeviceStable(false);
      setCaptureCountdown(null);
    }
  };

  const renderCameraContent = () => {
    if (!needsCamera) {
      return null;
    }

    if (!permission) {
      return (
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Caméra requise</Text>
          <Text style={styles.permissionSubtitle}>
            Autorisez l’accès à la caméra pour scanner vos documents en toute sécurité.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={() => requestPermission()}>
            <Text style={styles.permissionButtonText}>Autoriser la caméra</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!permission.granted) {
      return (
        <View style={styles.permissionCard}>
          <Ionicons name="lock-closed" size={28} color={Colors.primary} />
          <Text style={[styles.permissionTitle, { marginTop: Spacing.sm }]}>Autorisation refusée</Text>
          <Text style={styles.permissionSubtitle}>
            Rendez-vous dans les réglages pour donner l’accès à la caméra.
          </Text>
          <TouchableOpacity style={styles.permissionButton} onPress={() => requestPermission()}>
            <Text style={styles.permissionButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (currentCaptureValue) {
      return (
        <View style={styles.previewContainer}>
          <Image source={{ uri: currentCaptureValue }} style={styles.previewImage} />
          <TouchableOpacity
            style={styles.retakeButton}
            onPress={() => handleRetake(currentCaptureKey!)}
          >
            <Ionicons name="refresh" size={18} color={Colors.white} />
            <Text style={styles.retakeButtonText}>Recommencer le scan</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.cameraWrapper}>
        <CameraView
          ref={(ref) => {
            cameraRef.current = ref;
          }}
          style={styles.camera}
          facing={currentCaptureKey === 'selfie' ? 'front' : 'back'}
          autofocus="on"
        >
          <View style={styles.cameraOverlay}>
            <View
              style={[
                styles.captureFrame,
                currentCaptureKey === 'selfie' && styles.captureFrameRound,
              ]}
            />
            <View style={styles.overlayInstruction}>
              <Ionicons
                name={currentCaptureKey === 'selfie' ? 'happy' : 'scan'}
                size={18}
                color={Colors.white}
              />
              <Text style={styles.overlayInstructionText}>
                {isDeviceStable
                  ? 'Document détecté, ne bougez plus…'
                  : 'Alignez l’élément dans le cadre'}
              </Text>
            </View>
            {captureCountdown !== null && (
              <View style={styles.countdownBadge}>
                <Text style={styles.countdownText}>
                  {captureCountdown <= 0 ? 'SCAN…' : captureCountdown}
                </Text>
              </View>
            )}
          </View>
        </CameraView>
      </View>
    );
  };

  const renderReviewContent = () => {
    if (!isReviewStep) {
      return null;
    }
    return (
      <View style={styles.reviewGrid}>
        {(['front', 'back', 'selfie'] as KycCaptureKey[]).map((key) => (
          <View key={key} style={styles.reviewItem}>
            <Image source={{ uri: captures[key]! }} style={styles.reviewImage} />
            <View style={styles.reviewLabelRow}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={styles.reviewLabel}>
                {key === 'front' ? 'Recto' : key === 'back' ? 'Verso' : 'Selfie'}
              </Text>
            </View>
            <TouchableOpacity style={styles.reviewRetake} onPress={() => handleRetake(key)}>
              <Ionicons name="refresh" size={14} color={Colors.primary} />
              <Text style={styles.reviewRetakeText}>Refaire</Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View entering={FadeInDown} style={styles.card}>
          <View style={styles.cardHeader}>
            <TouchableOpacity onPress={onClose} hitSlop={16}>
              <Ionicons name="close" size={22} color={Colors.gray[600]} />
            </TouchableOpacity>
            <View style={styles.stepIndicator}>
              {steps.map((step, index) => (
                <View
                  key={step.title}
                  style={[
                    styles.stepDot,
                    index <= currentStepIndex && styles.stepDotActive,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.stepLabel}>
              Étape {currentStepIndex + 1}/{steps.length}
            </Text>
          </View>

          <Text style={styles.title}>{currentStep.title}</Text>
          <Text style={styles.subtitle}>{currentStep.description}</Text>

          {needsCamera ? renderCameraContent() : renderReviewContent()}

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.secondaryButton, currentStepIndex === 0 && styles.secondaryButtonGhost]}
              onPress={handleGoBack}
              disabled={isSubmitting}
            >
              <Text
                style={[
                  styles.secondaryButtonText,
                  currentStepIndex === 0 && styles.secondaryButtonGhostText,
                ]}
              >
                {currentStepIndex === 0 ? 'Fermer' : 'Retour'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                (!canContinue || isSubmitting) && styles.primaryButtonDisabled,
              ]}
              onPress={handleContinue}
              disabled={!canContinue || isSubmitting}
            >
              {isReviewStep && isSubmitting ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {isReviewStep ? 'Envoyer' : 'Continuer'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[300],
  },
  stepDotActive: {
    backgroundColor: Colors.primary,
  },
  stepLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    fontWeight: FontWeights.medium,
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  subtitle: {
    color: Colors.gray[600],
    fontSize: FontSizes.base,
    marginBottom: Spacing.sm,
  },
  cameraWrapper: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  camera: {
    width: '100%',
    aspectRatio: 3 / 4,
  },
  cameraOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  captureFrame: {
    width: '80%',
    height: '55%',
    borderRadius: BorderRadius.lg,
    borderWidth: 2,
    borderColor: Colors.white,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  captureFrameRound: {
    borderRadius: BorderRadius.full,
    width: 220,
    height: 220,
  },
  overlayInstruction: {
    position: 'absolute',
    bottom: Spacing.xl,
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  overlayInstructionText: {
    color: Colors.white,
    fontWeight: FontWeights.medium,
  },
  countdownBadge: {
    position: 'absolute',
    top: Spacing.lg,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xs,
  },
  countdownText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.lg,
  },
  previewContainer: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.gray[200],
    alignItems: 'center',
  },
  previewImage: {
    width: '100%',
    aspectRatio: 3 / 4,
  },
  retakeButton: {
    position: 'absolute',
    bottom: Spacing.md,
    alignSelf: 'center',
    backgroundColor: Colors.black + 'AA',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  retakeButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  permissionCard: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.xl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.gray[50],
  },
  permissionTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  permissionSubtitle: {
    color: Colors.gray[600],
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  permissionButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  reviewGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  reviewItem: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  reviewImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: BorderRadius.md,
  },
  reviewLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  reviewLabel: {
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  reviewRetake: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  reviewRetakeText: {
    color: Colors.primary,
    fontWeight: FontWeights.medium,
  },
  footer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  secondaryButton: {
    flex: 1,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  secondaryButtonGhost: {
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[100],
  },
  secondaryButtonText: {
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  secondaryButtonGhostText: {
    color: Colors.gray[600],
  },
  primaryButton: {
    flex: 1,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
});

