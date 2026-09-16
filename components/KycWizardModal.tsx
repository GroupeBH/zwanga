import { useKycCaptureViews } from '../hooks/identity/useKycCaptureViews';
import { useKycCaptureActions } from '../hooks/identity/useKycCaptureActions';
import {
  KycCaptureKey,
  KycWizardModalProps,
  DOCUMENT_STEPS,
  STABILITY_THRESHOLD,
  STABILITY_DURATION_MS,
  MANUAL_CAPTURE_DELAY_MS,
} from '../features/identity/kycCaptureModel';

export type { KycCaptureKey } from '../features/identity/kycCaptureModel';
export type { KycCaptureResult } from '../features/identity/kycCaptureModel';
import { styles } from '../features/screen-styles/components/KycWizardModal/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';

import { Accelerometer, type AccelerometerMeasurement } from 'expo-sensors';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';

export function KycWizardModal({
  visible,
  onClose,
  onComplete,
  isSubmitting,
  initialValues,
}: KycWizardModalProps) {
  const [permission, requestPermission] = useCameraPermissions();

  const requestCameraPermissionSafely = useCallback(async () => {
    try {
      await requestPermission();
    } catch (error) {
      console.warn('[KycWizard] Camera permission failed:', error);
    }
  }, [requestPermission]);
  const cameraRef = useRef<CameraView | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [captures, setCaptures] = useState<Record<KycCaptureKey, string | null>>({
    front: initialValues?.front ?? null,
    selfie: initialValues?.selfie ?? null,
  });
  const [isDeviceStable, setIsDeviceStable] = useState(false);
  const [captureCountdown, setCaptureCountdown] = useState<number | null>(null);
  const [manualCaptureAvailable, setManualCaptureAvailable] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isNativeCameraOpening, setIsNativeCameraOpening] = useState(false);
  const [androidPictureSize, setAndroidPictureSize] = useState<string | undefined>();
  const isCapturingRef = useRef(false);
  const stabilityTimerRef = useRef<NodeJS.Timeout | null>(null);
  const manualFallbackTimerRef = useRef<NodeJS.Timeout | null>(null);
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
    ? Boolean(captures.front && captures.selfie)
    : Boolean(currentCaptureValue);

  useEffect(() => {
    if (visible) {
      setCaptures({
        front: initialValues?.front ?? null,
        selfie: initialValues?.selfie ?? null,
      });
      setCurrentStepIndex(0);
      setCaptureCountdown(null);
      setIsDeviceStable(false);
      setManualCaptureAvailable(false);
      setIsCameraReady(false);
      setIsNativeCameraOpening(false);
      setAndroidPictureSize(undefined);
      isCapturingRef.current = false;
    } else {
      cleanupManualFallbackTimer();
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
      cleanupManualFallbackTimer();
      setCaptureCountdown(null);
      setManualCaptureAvailable(false);
      return;
    }

    if (isDeviceStable && captureCountdown === null) {
      setManualCaptureAvailable(false);
      setCaptureCountdown(2);
    } else if (!isDeviceStable && captureCountdown !== null) {
      setCaptureCountdown(null);
      setManualCaptureAvailable(false);
    }
  }, [captureCountdown, currentCaptureValue, isDeviceStable, needsCamera]);

  useEffect(() => {
    cleanupManualFallbackTimer();

    if (
      !visible ||
      !needsCamera ||
      currentCaptureValue ||
      !permission?.granted ||
      captureCountdown !== null
    ) {
      return;
    }

    manualFallbackTimerRef.current = setTimeout(() => {
      if (!isCapturingRef.current) {
        setManualCaptureAvailable(true);
      }
    }, MANUAL_CAPTURE_DELAY_MS);

    return cleanupManualFallbackTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    captureCountdown,
    currentCaptureKey,
    currentCaptureValue,
    needsCamera,
    permission?.granted,
    visible,
  ]);

  useEffect(() => {
    setAndroidPictureSize(undefined);
    setIsCameraReady(false);
    setIsNativeCameraOpening(false);
  }, [currentCaptureKey]);

  const { cleanupManualFallbackTimer, cleanupStabilityTracking, autoCapture, handleCameraReady, handleManualCapture } = useKycCaptureActions({
    manualFallbackTimerRef,
    stabilityTimerRef,
    lastMeasurementRef,
    setIsDeviceStable,
    setCaptureCountdown,
    setIsCameraReady,
    cameraRef,
    setAndroidPictureSize,
    currentCaptureKey,
    isCapturingRef,
    setIsCapturing,
    setManualCaptureAvailable,
    setIsNativeCameraOpening,
    setCaptures,
    currentCaptureValue,
  });

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
  }, [autoCapture, captureCountdown]);

  const handleContinue = () => {
    if (isReviewStep) {
      onComplete({
        front: captures.front!,
        selfie: captures.selfie!,
      });
      return;
    }
    setCurrentStepIndex((prev) => Math.min(prev + 1, steps.length - 1));
    setCaptureCountdown(null);
    setIsDeviceStable(false);
    setManualCaptureAvailable(false);
  };

  const handleGoBack = () => {
    if (currentStepIndex === 0) {
      onClose();
      return;
    }
    setCurrentStepIndex((prev) => Math.max(prev - 1, 0));
    setCaptureCountdown(null);
    setIsDeviceStable(false);
    setManualCaptureAvailable(false);
  };

  const handleRetake = (key: KycCaptureKey) => {
    setCaptures((prev) => ({
      ...prev,
      [key]: null,
    }));
    if (currentCaptureKey === key) {
      setIsDeviceStable(false);
      setCaptureCountdown(null);
      setManualCaptureAvailable(false);
    }
  };

  const { renderCameraContent, renderReviewContent } = useKycCaptureViews({
    needsCamera,
    permission,
    requestCameraPermissionSafely,
    currentCaptureValue,
    handleRetake,
    currentCaptureKey,
    isNativeCameraOpening,
    cameraRef,
    handleCameraReady,
    androidPictureSize,
    isCameraReady,
    manualCaptureAvailable,
    isDeviceStable,
    captureCountdown,
    handleManualCapture,
    isCapturing,
    isReviewStep,
    captures,
  });

  if (!visible) {
    return null;
  }

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



