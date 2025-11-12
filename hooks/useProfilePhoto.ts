import { useState } from 'react';
import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useAppDispatch } from '@/store/hooks';
import { updateUser } from '@/store/slices/authSlice';
import { useUpdateUserMutation } from '@/store/api/zwangaApi';

/**
 * Hook pour gérer la photo de profil
 * Permet de sélectionner une photo depuis la caméra ou la galerie
 */
export function useProfilePhoto() {
  const dispatch = useAppDispatch();
  const [updateUserMutation, { isLoading }] = useUpdateUserMutation();
  const [isUploading, setIsUploading] = useState(false);

  const requestPermissions = async () => {
    // Demander la permission caméra
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (cameraStatus !== 'granted') {
      Alert.alert(
        'Permission requise',
        'L\'accès à la caméra est nécessaire pour prendre une photo de profil.'
      );
      return false;
    }

    // Demander la permission galerie
    const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (mediaStatus !== 'granted') {
      Alert.alert(
        'Permission requise',
        'L\'accès à la galerie est nécessaire pour sélectionner une photo.'
      );
      return false;
    }

    return true;
  };

  const pickImage = async (source: 'camera' | 'gallery') => {
    const hasPermission = await requestPermissions();
    if (!hasPermission) return null;

    try {
      let result;

      if (source === 'camera') {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      }

      if (!result.canceled && result.assets[0]) {
        return result.assets[0].uri;
      }

      return null;
    } catch (error) {
      console.error('Erreur lors de la sélection de l\'image:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner l\'image');
      return null;
    }
  };

  const showImagePicker = (): Promise<string | null> => {
    return new Promise((resolve) => {
      Alert.alert(
        'Changer la photo de profil',
        'Choisissez une source',
        [
          {
            text: 'Caméra',
            onPress: async () => {
              const uri = await pickImage('camera');
              resolve(uri);
            },
          },
          {
            text: 'Galerie',
            onPress: async () => {
              const uri = await pickImage('gallery');
              resolve(uri);
            },
          },
          {
            text: 'Annuler',
            style: 'cancel',
            onPress: () => resolve(null),
          },
        ]
      );
    });
  };

  const updateProfilePhoto = async (imageUri: string) => {
    try {
      setIsUploading(true);

      // Dans un vrai cas, vous devriez uploader l'image vers un serveur
      // et récupérer l'URL. Pour l'instant, on utilise l'URI locale
      // TODO: Implémenter l'upload vers le backend
      
      // Simuler l'upload (dans un vrai cas, utiliser FormData)
      // const formData = new FormData();
      // formData.append('avatar', {
      //   uri: imageUri,
      //   type: 'image/jpeg',
      //   name: 'avatar.jpg',
      // } as any);
      
      // const response = await updateUserMutation({ avatar: uploadedUrl }).unwrap();

      // Pour l'instant, on met à jour directement avec l'URI locale
      // Dans un vrai cas, utiliser l'URL retournée par le serveur
      const avatarUrl = imageUri; // À remplacer par l'URL du serveur

      // Mettre à jour via l'API
      await updateUserMutation({ avatar: avatarUrl }).unwrap();

      // Mettre à jour le state Redux
      dispatch(updateUser({ avatar: avatarUrl }));

      Alert.alert('Succès', 'Photo de profil mise à jour avec succès');
      return true;
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour de la photo:', error);
      Alert.alert('Erreur', error?.data?.message || 'Impossible de mettre à jour la photo de profil');
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  const changeProfilePhoto = async (): Promise<boolean> => {
    const imageUri = await showImagePicker();
    
    if (!imageUri) {
      return false;
    }

    return await updateProfilePhoto(imageUri);
  };

  return {
    changeProfilePhoto,
    pickImage,
    isUploading: isUploading || isLoading,
  };
}

