import type { Router } from 'expo-router';
import type { DialogOptions } from '@/features/dialogs/dialogTypes';

export function isPublicationPhotoRequired(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { code?: string; data?: { code?: string; error?: { code?: string } } };
  return [value.code, value.data?.code, value.data?.error?.code].includes('DRIVER_PROFILE_PHOTO_REQUIRED');
}

export function publicationPhotoDialog(router: Pick<Router, 'push'>): DialogOptions {
  return {
    variant: 'warning',
    icon: 'camera-outline',
    title: 'Ajoutez votre photo de profil',
    message: 'Une photo est nécessaire pour publier plusieurs trajets. Elle aide les passagers à vous reconnaître. Votre formulaire reste conservé pendant que vous ajoutez votre photo.',
    actions: [
      { label: 'Plus tard', variant: 'ghost' },
      { label: 'Ajouter ma photo', variant: 'primary', onPress: () => router.push('/edit-profile') },
    ],
  };
}
