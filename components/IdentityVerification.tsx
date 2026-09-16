import { styles } from '../features/identity/IdentityVerification.styles';
import React, { useState, useRef } from 'react';
import { View, Text, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import Animated, { FadeInDown, FadeOutUp } from '@/utils/reanimated';
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
    try {
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
    } catch (error) {
      console.warn('[IdentityVerification] Camera permission failed:', error);
      showDialog({
        variant: 'danger',
        title: 'Caméra indisponible',
        message: 'Impossible d\'ouvrir la caméra pour le moment.',
      });
      return false;
    }
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
          quality: 0.65,
          base64: false,
          exif: false,
        });

        const imageUri = result.assets?.[0]?.uri;
        if (!result.canceled && imageUri) {
          setIdCardImage(imageUri);
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
          quality: 0.65,
          base64: false,
          exif: false,
        });

        const imageUri = result.assets?.[0]?.uri;
        if (!result.canceled && imageUri) {
          setIdCardImage(imageUri);
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
        quality: 0.65,
        base64: false,
        exif: false,
      });

      const imageUri = result.assets?.[0]?.uri;
      if (!result.canceled && imageUri) {
        setFaceImage(imageUri);
        setIsProcessing(true);
        
        // Simuler le traitement de reconnaissance faciale
        setTimeout(() => {
          setIsProcessing(false);
          setStep('completed');
          
          // Appeler onComplete avec les images
          if (idCardImage && imageUri) {
            onComplete({
              idCardImage,
              faceImage: imageUri,
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
          <Text style={styles.stepTitle}>Scanner votre carte d&apos;identité</Text>
          <Text style={styles.stepSubtitle}>
            Prenez une photo claire de votre carte d&apos;identité nationale
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
            <Text style={styles.scanButtonText}>Scanner la carte d&apos;identité</Text>
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

