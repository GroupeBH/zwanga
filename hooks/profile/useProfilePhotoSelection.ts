import { useDialog } from '@/components/ui/DialogProvider';
import { ProfilePhotoCameraCapture } from '@/components/profile/ProfilePhotoCameraCapture';
import type { DialogOptions } from '@/features/dialogs/dialogTypes';
import { claimProfileImageUri, releaseProfileImageUri, type ProfilePhotoSelection, type ProfilePhotoSource } from '@/features/profile/profilePhotoRecovery';
import { prepareProfilePhoto } from '@/utils/profilePhoto';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator } from 'react-native';

type SelectionFlow = { cancelled: boolean; dialog: boolean; finishWait?: () => void };

/** Shared local selection only: signup must never call an authenticated profile endpoint. */
export function useProfilePhotoSelection({ enabled = true }: { enabled?: boolean } = {}) {
  const { showDialog, hideDialog } = useDialog();
  const focused = useIsFocused();
  const allowed = useRef(enabled && focused);
  allowed.current = enabled && focused;
  const current = useRef<SelectionFlow | null>(null);
  const mounted = useRef(false);
  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    mounted.current = true;
    if (!enabled || !focused) setIsSelecting(false);
    return () => {
      mounted.current = false;
      const flow = current.current;
      if (!flow) return;
      flow.cancelled = true;
      flow.finishWait?.();
      if (flow.dialog) hideDialog();
      current.current = null;
    };
  }, [enabled, focused, hideDialog]);

  const choosePhoto = useCallback(async (initial?: ProfilePhotoSelection): Promise<string | null> => {
    if (!allowed.current || !mounted.current || current.current) return null;
    const flow: SelectionFlow = { cancelled: false, dialog: false };
    current.current = flow;
    setIsSelecting(true);
    const valid = () => !flow.cancelled && mounted.current && allowed.current && current.current === flow;
    const waitFor = <T,>(build: (finish: (value: T | null, closes?: boolean) => void) => DialogOptions) =>
      new Promise<T | null>(resolve => {
        if (!valid()) { resolve(null); return; }
        let settled = false;
        const finish = (value: T | null, closes = true) => {
          if (settled) return;
          settled = true;
          flow.finishWait = undefined;
          if (closes) flow.dialog = false;
          resolve(valid() ? value : null);
        };
        flow.finishWait = () => finish(null, false);
        flow.dialog = true;
        showDialog({ ...build(finish), dismissible: false });
      });
    let claimed: string | undefined;
    let confirmed = false;
    try {
      let selection = initial;
      while (valid()) {
        if (!selection) {
          const source = await waitFor<ProfilePhotoSource>(finish => ({
            title: 'Photo de profil', message: 'Prenez une photo ici ou choisissez-la dans votre galerie.',
            actions: [
              // Replace the current dialog in place. No competing iOS modal presentation.
              { label: 'Caméra', variant: 'primary', autoClose: false, onPress: () => finish('camera', false) },
              { label: 'Galerie', variant: 'secondary', onPress: () => finish('gallery') },
              { label: 'Annuler', variant: 'ghost', onPress: () => finish(null) },
            ],
          }));
          if (!source || !valid()) return null;
          let uri: string | null = null;
          if (source === 'camera') {
            uri = await waitFor<string>(finish => ({
              title: 'Prendre une photo', message: 'Cadrez votre visage. La caméra reste dans Zwanga.',
              content: createElement(ProfilePhotoCameraCapture, { onCapture: value => finish(value, false) }),
              actions: [{ label: 'Annuler', variant: 'ghost', onPress: () => finish(null) }],
            }));
          } else {
            // DialogProvider waits for iOS dismissal before running the gallery action.
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!valid()) return null;
            if (!permission.granted) {
              showDialog({ variant: 'warning', title: 'Galerie non autorisée',
                message: 'Autorisez les photos dans les réglages du téléphone, ou utilisez la caméra dans Zwanga.' });
              return null;
            }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', allowsEditing: false,
              quality: 0.65, base64: false, exif: false });
            if (!result.canceled) uri = result.assets?.[0]?.uri ?? null;
          }
          if (!uri || !valid()) return null;
          selection = { uri, source };
        }
        if (!claimProfileImageUri(selection.uri)) return null;
        claimed = selection.uri;
        // Detach CameraView before decoding/preparing the image; no full-resolution preview.
        flow.dialog = true;
        showDialog({ title: 'Préparation de la photo…', dismissible: false,
          content: createElement(ActivityIndicator, { accessibilityLabel: 'Préparation de la photo' }),
          actions: [{ label: 'Annuler', variant: 'ghost', onPress: () => { flow.cancelled = true; flow.dialog = false; } }],
        });
        const uri = await prepareProfilePhoto(selection.uri);
        if (!valid()) return null;
        const decision = await waitFor<'confirm' | 'retry'>(finish => ({
          title: 'Utiliser cette photo ?', previewImageUri: uri,
          message: 'Vérifiez la photo avant de la valider pour votre profil.',
          actions: [
            { label: 'Utiliser cette photo', variant: 'primary', onPress: () => finish('confirm') },
            { label: selection?.source === 'camera' ? 'Reprendre la photo' : 'Choisir une autre photo',
              variant: 'secondary', autoClose: false, onPress: () => finish('retry', false) },
            { label: 'Annuler', variant: 'ghost', onPress: () => finish(null) },
          ],
        }));
        if (decision === 'confirm' && valid()) { confirmed = true; return uri; }
        releaseProfileImageUri(claimed);
        claimed = undefined;
        if (decision !== 'retry') return null;
        selection = undefined;
      }
      return null;
    } catch {
      if (valid()) {
        // The error replaces any camera/processing dialog, it does not stack a new modal.
        flow.dialog = false;
        showDialog({ variant: 'danger', title: 'Photo indisponible',
          message: 'Impossible de préparer cette photo. Réessayez ou choisissez une autre photo.' });
      }
      return null;
    } finally {
      if (claimed && !confirmed) releaseProfileImageUri(claimed);
      if (current.current === flow) {
        if (flow.dialog) hideDialog();
        current.current = null;
        if (mounted.current) setIsSelecting(false);
      }
    }
  }, [hideDialog, showDialog]);

  return { choosePhoto, isSelecting };
}
