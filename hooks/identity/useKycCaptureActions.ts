import {
  KycCaptureKey,
  KYC_CAPTURE_QUALITY,
  ANDROID_CAMERA_RELEASE_DELAY_MS,
  wait,
  chooseKycPictureSize,
} from '../../features/identity/kycCaptureModel';
import { CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { type AccelerometerMeasurement } from 'expo-sensors';
import React, { useCallback } from 'react';
import { Platform } from 'react-native';

interface Params {
  manualFallbackTimerRef: React.RefObject<NodeJS.Timeout | null>;
  stabilityTimerRef: React.RefObject<NodeJS.Timeout | null>;
  lastMeasurementRef: React.RefObject<AccelerometerMeasurement | null>;
  setIsDeviceStable: React.Dispatch<React.SetStateAction<boolean>>;
  setCaptureCountdown: React.Dispatch<React.SetStateAction<number | null>>;
  setIsCameraReady: React.Dispatch<React.SetStateAction<boolean>>;
  cameraRef: React.RefObject<CameraView | null>;
  setAndroidPictureSize: React.Dispatch<React.SetStateAction<string | undefined>>;
  currentCaptureKey: KycCaptureKey | null;
  isCapturingRef: React.RefObject<boolean>;
  setIsCapturing: React.Dispatch<React.SetStateAction<boolean>>;
  setManualCaptureAvailable: React.Dispatch<React.SetStateAction<boolean>>;
  setIsNativeCameraOpening: React.Dispatch<React.SetStateAction<boolean>>;
  setCaptures: React.Dispatch<React.SetStateAction<Record<KycCaptureKey, string | null>>>;
  currentCaptureValue: string | null;
}

export function useKycCaptureActions({
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
}: Params) {
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

  return {
    cleanupManualFallbackTimer,
    cleanupStabilityTracking,
    autoCapture,
    handleCameraReady,
    handleManualCapture,
  };
}
