import { useDialog } from '@/components/ui/DialogProvider';
import { ProfilePhotoCameraCapture } from '@/components/profile/ProfilePhotoCameraCapture';
import { useUpdateUserMutation } from '@/store/api/zwangaApi';
import { useAppDispatch } from '@/store/hooks';
import { updateUser } from '@/store/slices/authSlice';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import * as ImagePicker from 'expo-image-picker';
import { createElement, useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

let pendingResultRecoveryInFlight = false;
const claimedProfileImageUris = new Map<string, number>();
const DUPLICATE_IMAGE_CLAIM_WINDOW_MS = 30_000;

type ProfilePhotoSource = 'camera' | 'gallery';

interface ProfilePhotoSelection {
  uri: string;
  source: ProfilePhotoSource;
}

type ProfilePhotoConfirmationResult = 'confirm' | 'retry' | 'cancel';

function claimProfileImageUri(uri: string) {
  const now = Date.now();
  claimedProfileImageUris.forEach((claimedAt, claimedUri) => {
    if (now - claimedAt >= DUPLICATE_IMAGE_CLAIM_WINDOW_MS) {
      claimedProfileImageUris.delete(claimedUri);
    }
  });

  const claimedAt = claimedProfileImageUris.get(uri);
  if (claimedAt && now - claimedAt < DUPLICATE_IMAGE_CLAIM_WINDOW_MS) {
    return false;
  }

  claimedProfileImageUris.set(uri, now);
  return true;
}

function releaseProfileImageUri(uri: string) {
  claimedProfileImageUris.delete(uri);
}

async function claimPendingProfileImageUri() {
  if (Platform.OS !== 'android' || pendingResultRecoveryInFlight) {
    return null;
  }

  pendingResultRecoveryInFlight = true;
  try {
    const result = await ImagePicker.getPendingResultAsync();
    if (!result) {
      return null;
    }

    if ('code' in result) {
      console.error('[ProfilePhoto] Pending image picker error:', result.message);
      return null;
    }

    if (result.canceled) {
      return null;
    }

    return result.assets?.[0]?.uri ?? null;
  } catch (error) {
    console.warn('[ProfilePhoto] Pending image recovery failed:', error);
    return null;
  } finally {
    pendingResultRecoveryInFlight = false;
  }
}

/**
 * Hook pour gérer la photo de profil
 * Permet de sélectionner une photo depuis la caméra ou la galerie
 */
export function useProfilePhoto() {
  const dispatch = useAppDispatch();
  const [updateUserMutation, { isLoading }] = useUpdateUserMutation();
  const [isUploading, setIsUploading] = useState(false);
  const { showDialog, hideDialog } = useDialog();

  const requestPermissions = useCallback(async (source: ProfilePhotoSource) => {
    try {
      if (source === 'camera') {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status === 'granted') {
          return true;
        }

        showDialog({
          variant: 'warning',
          title: 'Permission requise',
          message: 'L\'accès à la caméra est nécessaire pour prendre une photo de profil.',
        });
        return false;
      }

      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        showDialog({
          variant: 'warning',
          title: 'Permission requise',
          message: 'L\'accès à la galerie est nécessaire pour sélectionner une photo.',
        });
        return false;
      }

      return true;
    } catch (error) {
      console.warn(`[ProfilePhoto] ${source} permission request failed:`, error);
      showDialog({
        variant: 'danger',
        title: 'Accès impossible',
        message: 'Impossible d\'ouvrir les autorisations du téléphone pour le moment.',
      });
      return false;
    }
  }, [showDialog]);

  const captureProfilePhotoInAppCamera = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      let resolved = false;

      const resolveOnce = (uri: string | null) => {
        if (resolved) {
          return;
        }

        resolved = true;
        resolve(uri);
      };

      showDialog({
        variant: 'info',
        title: 'Prendre une photo',
        message: 'Cadrez votre visage, puis appuyez sur “Prendre la photo”.',
        dismissible: false,
        content: createElement(ProfilePhotoCameraCapture, {
          onCapture: (uri: string) => {
            hideDialog();
            setTimeout(() => resolveOnce(uri), 0);
          },
        }),
        actions: [
          {
            label: 'Annuler',
            variant: 'ghost',
            onPress: () => resolveOnce(null),
          },
        ],
      });
    });
  }, [hideDialog, showDialog]);

  const pickImage = useCallback(async (source: ProfilePhotoSource) => {
    if (source === 'camera' && Platform.OS === 'android') {
      return captureProfilePhotoInAppCamera();
    }

    const hasPermission = await requestPermissions(source);
    if (!hasPermission) return null;

    try {
      let result;

      if (source === 'camera') {
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          allowsEditing: false,
          quality: 0.65,
          base64: false,
          exif: false,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          allowsEditing: false,
          quality: 0.65,
          base64: false,
          exif: false,
        });
      }

      const imageUri = result.assets?.[0]?.uri;
      if (!result.canceled && imageUri) {
        return imageUri;
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
  }, [captureProfilePhotoInAppCamera, requestPermissions, showDialog]);

  const showImagePicker = useCallback((): Promise<ProfilePhotoSelection | null> => {
    return new Promise((resolve) => {
      showDialog({
        variant: 'info',
        title: 'Changer la photo de profil',
        message: 'Choisissez une source',
        dismissible: false,
        actions: [
          {
            label: 'Caméra',
            variant: 'primary',
            onPress: async () => {
              const uri = await pickImage('camera');
              resolve(uri ? { uri, source: 'camera' } : null);
            },
          },
          {
            label: 'Galerie',
            variant: 'secondary',
            onPress: async () => {
              const uri = await pickImage('gallery');
              resolve(uri ? { uri, source: 'gallery' } : null);
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
  }, [pickImage, showDialog]);

  const confirmProfilePhoto = useCallback(
    (selection: ProfilePhotoSelection): Promise<ProfilePhotoConfirmationResult> => {
      const retryLabel = selection.source === 'camera' ? 'Reprendre la photo' : 'Choisir une autre photo';
      const message =
        selection.source === 'camera'
          ? 'Voici la photo prise. Si elle vous convient, validez pour la mettre sur votre profil.'
          : 'Voici la photo choisie. Si elle vous convient, validez pour la mettre sur votre profil.';

      return new Promise((resolve) => {
        showDialog({
          variant: 'info',
          icon: 'person-circle',
          title: 'Valider cette photo ?',
          message,
          previewImageUri: selection.uri,
          dismissible: false,
          actions: [
            {
              label: 'Utiliser cette photo',
              variant: 'primary',
              onPress: () => resolve('confirm'),
            },
            {
              label: retryLabel,
              variant: 'secondary',
              onPress: () => resolve('retry'),
            },
            {
              label: 'Annuler',
              variant: 'ghost',
              onPress: () => resolve('cancel'),
            },
          ],
        });
      });
    },
    [showDialog],
  );

  const updateProfilePhoto = useCallback(async (imageUri: string) => {
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
        message: getApiErrorMessage(error, 'Impossible de mettre à jour la photo de profil.'),
      });
      return false;
    } finally {
      setIsUploading(false);
    }
  }, [dispatch, showDialog, updateUserMutation]);

  const confirmAndUpdateProfilePhoto = useCallback(
    async (initialSelection?: ProfilePhotoSelection): Promise<boolean> => {
      let currentSelection = initialSelection ?? (await showImagePicker());
      let claimedUri: string | null = null;

      while (currentSelection) {
        if (claimedUri !== currentSelection.uri) {
          if (claimedUri) {
            releaseProfileImageUri(claimedUri);
          }

          if (!claimProfileImageUri(currentSelection.uri)) {
            return false;
          }

          claimedUri = currentSelection.uri;
        }

        const confirmation = await confirmProfilePhoto(currentSelection);

        if (confirmation === 'cancel') {
          releaseProfileImageUri(currentSelection.uri);
          return false;
        }

        if (confirmation === 'retry') {
          currentSelection = await showImagePicker();
          continue;
        }

        const updated = await updateProfilePhoto(currentSelection.uri);
        if (!updated) {
          releaseProfileImageUri(currentSelection.uri);
        }
        return updated;
      }

      if (claimedUri) {
        releaseProfileImageUri(claimedUri);
      }

      return false;
    },
    [confirmProfilePhoto, showImagePicker, updateProfilePhoto],
  );

  useEffect(() => {
    let cancelled = false;

    const recoverPendingPhoto = async () => {
      const imageUri = await claimPendingProfileImageUri();
      if (cancelled || !imageUri) {
        return;
      }

      await confirmAndUpdateProfilePhoto({ uri: imageUri, source: 'gallery' });
    };

    void recoverPendingPhoto();
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void recoverPendingPhoto();
      }
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [confirmAndUpdateProfilePhoto]);

  const changeProfilePhoto = useCallback(async (): Promise<boolean> => {
    return confirmAndUpdateProfilePhoto();
  }, [confirmAndUpdateProfilePhoto]);

  return {
    changeProfilePhoto,
    pickImage,
    isUploading: isUploading || isLoading,
  };
}

