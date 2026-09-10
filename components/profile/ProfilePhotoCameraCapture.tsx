import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface ProfilePhotoCameraCaptureProps {
  onCapture: (uri: string) => void;
}

export function ProfilePhotoCameraCapture({ onCapture }: ProfilePhotoCameraCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const [facing, setFacing] = useState<'front' | 'back'>('front');
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    if (!permission || permission.granted || permission.canAskAgain === false) {
      return;
    }

    requestPermission().catch(() => {
      setCaptureError("Impossible d'ouvrir la caméra pour le moment.");
    });
  }, [permission, requestPermission]);

  const handleFlipCamera = useCallback(() => {
    setFacing((current) => (current === 'front' ? 'back' : 'front'));
    setIsCameraReady(false);
  }, []);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || isCapturing) {
      return;
    }

    try {
      setIsCapturing(true);
      setCaptureError(null);

      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.65,
        base64: false,
        exif: false,
        skipProcessing: false,
      });

      if (photo?.uri) {
        onCapture(photo.uri);
        return;
      }

      setCaptureError("La photo n'a pas pu être récupérée. Réessayez.");
    } catch {
      setCaptureError("La photo n'a pas pu être prise. Réessayez.");
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, onCapture]);

  if (!permission) {
    return (
      <View style={styles.permissionState}>
        <ActivityIndicator color={Colors.primary} />
        <Text style={styles.permissionText}>Préparation de la caméra...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.permissionState}>
        <Ionicons name="camera" size={28} color={Colors.primary} />
        <Text style={styles.permissionTitle}>Caméra requise</Text>
        <Text style={styles.permissionText}>
          Autorisez la caméra pour prendre votre photo de profil.
        </Text>
        {permission.canAskAgain !== false ? (
          <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
            <Text style={styles.permissionButtonText}>Autoriser la caméra</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.permissionText}>
            Activez la caméra dans les réglages du téléphone puis réessayez.
          </Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.cameraFrame}>
        <CameraView
          ref={(ref) => {
            cameraRef.current = ref;
          }}
          style={styles.camera}
          facing={facing}
          mirror={facing === 'front'}
          autofocus="on"
          onCameraReady={() => setIsCameraReady(true)}
        />
        <View pointerEvents="none" style={styles.overlay}>
          {!isCameraReady ? (
            <View style={styles.preparingBadge}>
              <ActivityIndicator color={Colors.white} size="small" />
              <Text style={styles.preparingText}>Préparation...</Text>
            </View>
          ) : null}
          <View style={styles.faceGuide} />
          <Text style={styles.guideText}>Placez votre visage dans le cercle</Text>
        </View>
      </View>

      {captureError ? <Text style={styles.errorText}>{captureError}</Text> : null}

      <View style={styles.controls}>
        <TouchableOpacity style={styles.secondaryControl} onPress={handleFlipCamera}>
          <Ionicons name="camera-reverse" size={18} color={Colors.gray[800]} />
          <Text style={styles.secondaryControlText}>Retourner</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.captureButton, (!isCameraReady || isCapturing) && styles.captureButtonDisabled]}
          onPress={handleCapture}
          disabled={!isCameraReady || isCapturing}
        >
          {isCapturing ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Ionicons name="camera" size={20} color={Colors.white} />
              <Text style={styles.captureButtonText}>Prendre la photo</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  cameraFrame: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    backgroundColor: Colors.gray[900],
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  preparingBadge: {
    position: 'absolute',
    top: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  preparingText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  faceGuide: {
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 2,
    borderColor: Colors.white,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  guideText: {
    position: 'absolute',
    bottom: Spacing.lg,
    color: Colors.white,
    fontWeight: FontWeights.semibold,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    overflow: 'hidden',
  },
  controls: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  secondaryControl: {
    flex: 0.42,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
    backgroundColor: Colors.gray[100],
  },
  secondaryControlText: {
    color: Colors.gray[800],
    fontWeight: FontWeights.semibold,
  },
  captureButton: {
    flex: 0.58,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: Spacing.xs,
  },
  captureButtonDisabled: {
    opacity: 0.65,
  },
  captureButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
  errorText: {
    color: Colors.danger,
    textAlign: 'center',
    fontWeight: FontWeights.medium,
  },
  permissionState: {
    alignItems: 'center',
    gap: Spacing.sm,
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    padding: Spacing.xl,
  },
  permissionTitle: {
    color: Colors.gray[900],
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
  },
  permissionText: {
    color: Colors.gray[600],
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: Spacing.xs,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  permissionButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
  },
});
