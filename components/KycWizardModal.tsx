import { styles } from '../features/screen-styles/components/KycWizardModal/index';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Accelerometer, type AccelerometerMeasurement } from 'expo-sensors';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';

export type KycCaptureKey = 'front' | 'selfie';

export interface KycCaptureResult {
  front: string;
  selfie: string;
}

interface KycWizardModalProps {
  visible: boolean;
  onClose: () => void;
  onComplete: (payload: KycCaptureResult) => void;
  isSubmitting: boolean;
  initialValues?: Partial<Record<KycCaptureKey, string | null>>;
}

const DOCUMENT_STEPS: { key: KycCaptureKey; title: string; description: string }[] = [
  {
    key: 'front',
    title: 'Scanner le recto',
    description: 'Cadrez le recto de votre pièce d’identité dans le gabarit lumineux.',
  },
  {
    key: 'selfie',
    title: 'Selfie de vérification',
    description: 'Regardez la caméra et centrez votre visage dans le cercle.',
  },
];

const STABILITY_THRESHOLD = 0.045;
const STABILITY_DURATION_MS = 1500;
const KYC_CAPTURE_MAX_EDGE = 1600;
const KYC_CAPTURE_MIN_EDGE = 720;
const KYC_CAPTURE_QUALITY = 0.6;
const MANUAL_CAPTURE_DELAY_MS = 5000;
const ANDROID_CAMERA_RELEASE_DELAY_MS = 300;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parsePictureSize = (size: string) => {
  const match = /^(\d+)x(\d+)$/.exec(size);
  if (!match) {
    return null;
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }

  return {
    size,
    width,
    height,
    area: width * height,
    maxEdge: Math.max(width, height),
    minEdge: Math.min(width, height),
  };
};

const chooseKycPictureSize = (sizes: string[]) => {
  const parsedSizes = sizes
    .map(parsePictureSize)
    .filter((size): size is NonNullable<ReturnType<typeof parsePictureSize>> => Boolean(size));

  if (parsedSizes.length === 0) {
    return undefined;
  }

  const readableSizes = parsedSizes.filter((size) => size.minEdge >= KYC_CAPTURE_MIN_EDGE);
  const cappedSizes = readableSizes.filter((size) => size.maxEdge <= KYC_CAPTURE_MAX_EDGE);

  if (cappedSizes.length > 0) {
    return [...cappedSizes].sort((a, b) => b.area - a.area)[0].size;
  }

  if (readableSizes.length > 0) {
    return [...readableSizes].sort((a, b) => a.area - b.area)[0].size;
  }

  return [...parsedSizes].sort((a, b) => b.area - a.area)[0].size;
};

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

  const cleanupManualFallbackTimer = () => {
    if (manualFallbackTimerRef.current) {
      clearTimeout(manualFallbackTimerRef.current);
      manualFallbackTimerRef.current = null;
    }
  };

  const cleanupStabilityTracking = () => {
    cleanupManualFallbackTimer();
    if (stabilityTimerRef.current) {
      clearTimeout(stabilityTimerRef.current);
      stabilityTimerRef.current = null;
    }
    lastMeasurementRef.current = null;
    setIsDeviceStable(false);
    setCaptureCountdown(null);
  };

  const handleCameraReady = useCallback(async () => {
    setIsCameraReady(true);

    if (Platform.OS !== 'android') {
      return;
    }

    try {
      const availableSizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      setAndroidPictureSize(chooseKycPictureSize(availableSizes ?? []));
    } catch (error) {
      console.warn('Unable to select a compact KYC picture size:', error);
    }
  }, []);

  const captureWithNativeCamera = useCallback(async () => {
    if (!currentCaptureKey || isCapturingRef.current) {
      return;
    }

    isCapturingRef.current = true;
    setIsCapturing(true);
    setManualCaptureAvailable(false);
    setIsNativeCameraOpening(true);
    setIsCameraReady(false);
    cleanupManualFallbackTimer();
    cleanupStabilityTracking();

    try {
      const { status } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        setManualCaptureAvailable(true);
        return;
      }

      await wait(ANDROID_CAMERA_RELEASE_DELAY_MS);

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: currentCaptureKey === 'selfie' ? [1, 1] : [3, 2],
        quality: KYC_CAPTURE_QUALITY,
        base64: false,
        exif: false,
      });
      const imageUri = result.assets?.[0]?.uri;

      if (!result.canceled && imageUri) {
        setCaptures((prev) => ({
          ...prev,
          [currentCaptureKey]: imageUri,
        }));
        return;
      }

      setManualCaptureAvailable(true);
    } catch (error) {
      console.warn('[KycWizard] Native camera capture failed:', error);
      setManualCaptureAvailable(true);
    } finally {
      isCapturingRef.current = false;
      setIsCapturing(false);
      setIsNativeCameraOpening(false);
      setIsDeviceStable(false);
      setCaptureCountdown(null);
    }
  }, [currentCaptureKey]);

  const captureCurrentFrame = useCallback(async (showManualFallback = false) => {
    if (!cameraRef.current || isCapturingRef.current || !currentCaptureKey) {
      if (showManualFallback && !currentCaptureValue) {
        setManualCaptureAvailable(true);
      }
      return;
    }
    isCapturingRef.current = true;
    setIsCapturing(true);
    setManualCaptureAvailable(false);
    let didCapture = false;
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: KYC_CAPTURE_QUALITY,
        base64: false,
        exif: false,
        skipProcessing: false,
      });
      if (photo?.uri) {
        didCapture = true;
        setCaptures((prev) => ({
          ...prev,
          [currentCaptureKey]: photo.uri,
        }));
      }
    } catch (error) {
      console.warn('Auto capture failed:', error);
    } finally {
      isCapturingRef.current = false;
      setIsCapturing(false);
      setIsDeviceStable(false);
      setCaptureCountdown(null);
      if (showManualFallback && !didCapture) {
        setManualCaptureAvailable(true);
      }
    }
  }, [currentCaptureKey, currentCaptureValue]);

  const autoCapture = useCallback(async () => {
    await captureCurrentFrame(true);
  }, [captureCurrentFrame]);

  const handleManualCapture = useCallback(async () => {
    if (Platform.OS === 'android') {
      await captureWithNativeCamera();
      return;
    }

    await captureCurrentFrame(true);
  }, [captureCurrentFrame, captureWithNativeCamera]);

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
          <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermissionSafely}>
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
          <TouchableOpacity style={styles.permissionButton} onPress={requestCameraPermissionSafely}>
            <Text style={styles.permissionButtonText}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (currentCaptureValue) {
      return (
        <View style={styles.previewContainer}>
          <Image
            source={{ uri: currentCaptureValue }}
            style={styles.previewImage}
            resizeMode="cover"
            fadeDuration={0}
          />
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
        {isNativeCameraOpening ? (
          <View style={styles.cameraFallback}>
            <ActivityIndicator color={Colors.white} />
            <Text style={styles.cameraFallbackText}>Ouverture de la caméra du téléphone...</Text>
          </View>
        ) : (
          <CameraView
            ref={(ref) => {
              cameraRef.current = ref;
            }}
            style={styles.camera}
            facing={currentCaptureKey === 'selfie' ? 'front' : 'back'}
            autofocus="on"
            onCameraReady={handleCameraReady}
            pictureSize={Platform.OS === 'android' ? androidPictureSize : undefined}
          />
        )}
        <View pointerEvents="box-none" style={styles.cameraOverlay}>
            {!isCameraReady && !isNativeCameraOpening && (
              <View pointerEvents="none" style={styles.cameraPreparing}>
                <ActivityIndicator color={Colors.white} />
                <Text style={styles.cameraPreparingText}>Préparation de la caméra...</Text>
              </View>
            )}
            <View
              pointerEvents="none"
              style={[
                styles.captureFrame,
                currentCaptureKey === 'selfie' && styles.captureFrameRound,
              ]}
            />
            {!manualCaptureAvailable && !isNativeCameraOpening && (
              <View pointerEvents="none" style={styles.overlayInstruction}>
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
            )}
            {captureCountdown !== null && (
              <View pointerEvents="none" style={styles.countdownBadge}>
                <Text style={styles.countdownText}>
                  {captureCountdown <= 0 ? 'SCAN…' : captureCountdown}
                </Text>
              </View>
            )}
            {manualCaptureAvailable && captureCountdown === null && !isNativeCameraOpening && (
              <TouchableOpacity
                style={styles.manualCaptureButton}
                onPress={handleManualCapture}
                disabled={isCapturing}
              >
                {isCapturing ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Ionicons name="camera" size={18} color={Colors.white} />
                    <Text style={styles.manualCaptureButtonText}>Scanner maintenant</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
        </View>
      </View>
    );
  };

  const renderReviewContent = () => {
    if (!isReviewStep) {
      return null;
    }
    return (
      <View style={styles.reviewGrid}>
        {(['front', 'selfie'] as KycCaptureKey[]).map((key) => (
          <View key={key} style={styles.reviewItem}>
            <Image
              source={{ uri: captures[key]! }}
              style={styles.reviewImage}
              resizeMode="cover"
              fadeDuration={0}
            />
            <View style={styles.reviewLabelRow}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={styles.reviewLabel}>
                {key === 'front' ? 'Recto' : 'Selfie'}
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



