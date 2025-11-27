import { useDialog } from '@/components/ui/DialogProvider';
import { useUpdateUserMutation } from '@/store/api/zwangaApi';
import { useAppDispatch } from '@/store/hooks';
import { updateUser } from '@/store/slices/authSlice';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';

/**
 * Hook pour gérer la photo de profil
 * Permet de sélectionner une photo depuis la caméra ou la galerie
 */
export function useProfilePhoto() {
  const dispatch = useAppDispatch();
  const [updateUserMutation, { isLoading }] = useUpdateUserMutation();
  const [isUploading, setIsUploading] = useState(false);
  const { showDialog } = useDialog();

  const requestPermissions = async () => {
    // Demander la permission caméra
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    if (cameraStatus !== 'granted') {
      showDialog({
        variant: 'warning',
        title: 'Permission requise',
        message: 'L\'accès à la caméra est nécessaire pour prendre une photo de profil.',
      });
      return false;
    }

    // Demander la permission galerie
    const { status: mediaStatus } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (mediaStatus !== 'granted') {
      showDialog({
        variant: 'warning',
        title: 'Permission requise',
        message: 'L\'accès à la galerie est nécessaire pour sélectionner une photo.',
      });
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
          mediaTypes: 'images',
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
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
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: 'Impossible de sélectionner l\'image',
      });
      return null;
    }
  };

  const showImagePicker = (): Promise<string | null> => {
    return new Promise((resolve) => {
      showDialog({
        variant: 'info',
        title: 'Changer la photo de profil',
        message: 'Choisissez une source',
        actions: [
          {
            label: 'Caméra',
            variant: 'primary',
            onPress: async () => {
              const uri = await pickImage('camera');
              resolve(uri);
            },
          },
          {
            label: 'Galerie',
            variant: 'secondary',
            onPress: async () => {
              const uri = await pickImage('gallery');
              resolve(uri);
            },
          },
          {
            label: 'Annuler',
            variant: 'ghost',
            onPress: () => resolve(null),
          },
        ],
      });
    });
  };

  const updateProfilePhoto = async (imageUri: string) => {
    try {
      setIsUploading(true);
      const extensionMatch = imageUri.split('.').pop()?.split('?')[0]?.toLowerCase();
      const extension = extensionMatch && extensionMatch.length <= 4 ? extensionMatch : 'jpg';
      const mimeType =
        extension === 'png'
          ? 'image/png'
          : extension === 'webp'
            ? 'image/webp'
            : extension === 'heic'
              ? 'image/heic'
              : 'image/jpeg';

      const formData = new FormData();
      formData.append('profilePicture', {
        uri: imageUri,
        name: `profile-${Date.now()}.${extension}`,
        type: mimeType,
      } as any);

      const updatedUser = await updateUserMutation(formData).unwrap();

      dispatch(
        updateUser({
          avatar: updatedUser.profilePicture ?? updatedUser.avatar,
          profilePicture: updatedUser.profilePicture ?? null,
        }),
      );

      showDialog({
        variant: 'success',
        title: 'Succès',
        message: 'Photo de profil mise à jour avec succès',
      });
      return true;
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour de la photo:', error);
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: error?.data?.message || 'Impossible de mettre à jour la photo de profil',
      });
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

