import { KycCaptureKey } from '../../features/identity/kycCaptureModel';
import { styles } from '../../features/screen-styles/components/KycWizardModal/index';
import { Colors, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import { CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import React from 'react';
import { ActivityIndicator, Image, Platform, Text, TouchableOpacity, View } from 'react-native';

interface Params {
  needsCamera: boolean;
  permission: ImagePicker.PermissionResponse | null;
  requestCameraPermissionSafely: () => Promise<void>;
  currentCaptureValue: string | null;
  handleRetake: (key: KycCaptureKey) => void;
  currentCaptureKey: KycCaptureKey | null;
  isNativeCameraOpening: boolean;
  cameraRef: React.RefObject<CameraView | null>;
  handleCameraReady: () => Promise<void>;
  androidPictureSize: string | undefined;
  isCameraReady: boolean;
  manualCaptureAvailable: boolean;
  isDeviceStable: boolean;
  captureCountdown: number | null;
  handleManualCapture: () => Promise<void>;
  isCapturing: boolean;
  isReviewStep: boolean;
  captures: Record<KycCaptureKey, string | null>;
}

export function useKycCaptureViews({
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
}: Params) {
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

  return {
    renderCameraContent,
    renderReviewContent,
  };
}
