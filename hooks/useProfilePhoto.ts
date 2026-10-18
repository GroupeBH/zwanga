import { claimPendingProfileImageUri } from '@/features/profile/profilePhotoRecovery';
import { useDialog } from '@/components/ui/DialogProvider';
import { useUpdateUserMutation } from '@/store/api/zwangaApi';
import { useAppDispatch } from '@/store/hooks';
import { updateUser } from '@/store/slices/authSlice';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { getTokenSessionVersion } from '@/services/tokenSession';
import { useScreenIsActive } from '@/hooks/useAppIsActive';
import { useProfilePhotoSelection } from './profile/useProfilePhotoSelection';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProfilePhotoSelection } from '@/features/profile/profilePhotoRecovery';

/** Authenticated update; camera/gallery/preview are shared with signup without uploading there. */
export function useProfilePhoto() {
  const dispatch = useAppDispatch();
  const [updateUserMutation, { isLoading }] = useUpdateUserMutation();
  const [isUploading, setIsUploading] = useState(false);
  const { showDialog } = useDialog();
  const { choosePhoto, isSelecting } = useProfilePhotoSelection();
  const active = useScreenIsActive();
  const busy = useRef(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const updateProfilePhoto = useCallback(async (imageUri: string, session: number) => {
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

      if (!mounted.current || session !== getTokenSessionVersion()) return false;
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
      if (!mounted.current || session !== getTokenSessionVersion()) return false;
      console.error('Erreur lors de la mise à jour de la photo:', error);
      showDialog({
        variant: 'danger',
        title: 'Erreur',
        message: getApiErrorMessage(error, 'Impossible de mettre à jour la photo de profil.'),
      });
      return false;
    } finally {
      if (mounted.current) setIsUploading(false);
    }
  }, [dispatch, showDialog, updateUserMutation]);


  const changeProfilePhoto = useCallback(async (initial?: ProfilePhotoSelection): Promise<boolean> => {
    if (busy.current) return false;
    busy.current = true;
    const session = getTokenSessionVersion();
    try {
      const uri = await choosePhoto(initial);
      if (!uri || !mounted.current || session !== getTokenSessionVersion()) return false;
      return await updateProfilePhoto(uri, session);
    } finally { busy.current = false; }
  }, [choosePhoto, updateProfilePhoto]);

  useEffect(() => {
    if (!active || isSelecting || isUploading) return;
    let cancelled = false;
    void (async () => {
      if (busy.current) return;
      const uri = await claimPendingProfileImageUri();
      if (!cancelled && uri && !busy.current) await changeProfilePhoto({ uri, source: 'gallery' });
    })();
    return () => { cancelled = true; };
  }, [active, changeProfilePhoto, isSelecting, isUploading]);

  // Do not forward a TouchableOpacity press event as a recovered photo selection.
  const change = useCallback(() => changeProfilePhoto(), [changeProfilePhoto]);
  return { changeProfilePhoto: change, isUploading: isSelecting || isUploading || isLoading };
}

