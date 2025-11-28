import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, CommonStyles } from '@/constants/styles';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useDialog } from '@/components/ui/DialogProvider';

type VerificationStep = 'idCard' | 'face' | 'completed';

interface IdentityVerificationProps {
  onComplete: (data: { idCardImage: string; faceImage: string }) => void;
  onSkip?: () => void;
  canSkip?: boolean;
}

export function IdentityVerification({ onComplete, onSkip, canSkip = true }: IdentityVerificationProps) {
  const [step, setStep] = useState<VerificationStep>('idCard');
  const [idCardImage, setIdCardImage] = useState<string | null>(null);
  const [faceImage, setFaceImage] = useState<string | null>(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isProcessing, setIsProcessing] = useState(false);
  const cameraRef = useRef<CameraView>(null);
  const { showDialog } = useDialog();

  const requestPermissions = async () => {
    if (!cameraPermission?.granted) {
      const { granted } = await requestCameraPermission();
      if (!granted) {
        showDialog({
          variant: 'warning',
          title: 'Permission requise',
          message: 'L\'accès à la caméra est nécessaire pour scanner votre identité.',
        });
        return false;
      }
    }
    return true;
  };

  const handleScanIdCard = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    const captureCard = async () => {
      try {
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          allowsEditing: true,
          aspect: [3, 2],
          quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
          setIdCardImage(result.assets[0].uri);
          setIsProcessing(true);
          setTimeout(() => {
            setIsProcessing(false);
            setStep('face');
          }, 2000);
        }
      } catch (error) {
        showDialog({
          variant: 'danger',
          title: 'Erreur',
          message: 'Impossible de prendre la photo',
        });
      }
    };

    const pickFromGallery = async () => {
      try {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showDialog({
            variant: 'warning',
            title: 'Permission requise',
            message: 'L\'accès à la galerie est nécessaire',
          });
          return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          allowsEditing: true,
          aspect: [3, 2],
          quality: 0.8,
        });

        if (!result.canceled && result.assets[0]) {
          setIdCardImage(result.assets[0].uri);
          setIsProcessing(true);
          setTimeout(() => {
            setIsProcessing(false);
            setStep('face');
          }, 2000);
        }
      } catch (error) {
        showDialog({
          variant: 'danger',
          title: 'Erreur',
          message: 'Impossible de sélectionner l’image',
        });
      }
    };

    showDialog({
      variant: 'info',
      title: 'Scanner la carte d\'identité',
      message: 'Choisissez une méthode de capture',
      actions: [
        { label: 'Prendre une photo', variant: 'primary', onPress: captureCard },
        { label: 'Choisir dans la galerie', variant: 'secondary', onPress: pickFromGallery },
        { label: 'Annuler', variant: 'ghost' },
      ],
    });
  };

  const handleScanFace = async () => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: 'images',
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setFaceImage(result.assets[0].uri);
        setIsProcessing(true);
        
        // Simuler le traitement de reconnaissance faciale
        setTimeout(() => {
          setIsProcessing(false);
          setStep('completed');
          
          // Appeler onComplete avec les images
          if (idCardImage && result.assets[0].uri) {
            onComplete({
              idCardImage,
              faceImage: result.assets[0].uri,
            });
          }
        }, 2000);
      }
    } catch (error) {
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: 'Impossible de prendre la photo',
      });
    }
  };

  const handleRetake = () => {
    if (step === 'face') {
      setFaceImage(null);
    } else {
      setIdCardImage(null);
      setStep('idCard');
    }
  };

  if (step === 'idCard') {
    return (
      <Animated.View entering={FadeInDown} exiting={FadeOutUp} style={styles.container}>
        <View style={styles.iconContainer}>
          <View style={[styles.iconCircle, styles.iconCircleBlue]}>
            <Ionicons name="id-card" size={48} color={Colors.info} />
          </View>
          <Text style={styles.stepTitle}>Scanner votre carte d'identité</Text>
          <Text style={styles.stepSubtitle}>
            Prenez une photo claire de votre carte d'identité nationale
          </Text>
        </View>

        {idCardImage ? (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: idCardImage }} style={styles.imagePreview} />
            {isProcessing ? (
              <View style={styles.processingOverlay}>
                <ActivityIndicator size="large" color={Colors.white} />
                <Text style={styles.processingText}>Traitement en cours...</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
                <Ionicons name="refresh" size={20} color={Colors.white} />
                <Text style={styles.retakeText}>Reprendre</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <TouchableOpacity style={styles.scanButton} onPress={handleScanIdCard}>
            <Ionicons name="camera" size={32} color={Colors.white} />
            <Text style={styles.scanButtonText}>Scanner la carte d'identité</Text>
          </TouchableOpacity>
        )}

        {canSkip && (
          <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
            <Text style={styles.skipText}>Passer cette étape</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  }

  if (step === 'face') {
    return (
      <Animated.View entering={FadeInDown} exiting={FadeOutUp} style={styles.container}>
        <View style={styles.iconContainer}>
          <View style={[styles.iconCircle, styles.iconCircleGreen]}>
            <Ionicons name="person" size={48} color={Colors.success} />
          </View>
          <Text style={styles.stepTitle}>Scanner votre visage</Text>
          <Text style={styles.stepSubtitle}>
            Prenez une photo de votre visage pour vérifier votre identité
          </Text>
        </View>

        {faceImage ? (
          <View style={styles.imagePreviewContainer}>
            <Image source={{ uri: faceImage }} style={styles.facePreview} />
            {isProcessing ? (
              <View style={styles.processingOverlay}>
                <ActivityIndicator size="large" color={Colors.white} />
                <Text style={styles.processingText}>Vérification en cours...</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <TouchableOpacity style={styles.scanButton} onPress={handleScanFace}>
            <Ionicons name="camera" size={32} color={Colors.white} />
            <Text style={styles.scanButtonText}>Prendre une photo</Text>
          </TouchableOpacity>
        )}

        {faceImage && !isProcessing && (
          <TouchableOpacity style={styles.retakeButton} onPress={handleRetake}>
            <Ionicons name="refresh" size={20} color={Colors.white} />
            <Text style={styles.retakeText}>Reprendre</Text>
          </TouchableOpacity>
        )}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeInDown} style={styles.container}>
      <View style={styles.iconContainer}>
        <View style={[styles.iconCircle, styles.iconCircleSuccess]}>
          <Ionicons name="checkmark-circle" size={48} color={Colors.success} />
        </View>
        <Text style={styles.stepTitle}>Vérification complétée!</Text>
        <Text style={styles.stepSubtitle}>
          Votre identité a été vérifiée avec succès
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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

