import { Platform } from 'react-native';
import type { LocationAccessIssue } from '@/services/foregroundLocationAccess';

export function locationAccessMessage(issue: LocationAccessIssue) {
  if (issue === 'services') return Platform.OS === 'ios'
    ? 'Activez « Service de localisation » dans Réglages > Confidentialité et sécurité > Service de localisation, puis revenez.'
    : 'Activez la localisation du téléphone, puis revenez dans Zwanga.';
  return issue === 'settings'
    ? 'Autorisez la position dans les réglages de Zwanga, puis revenez.'
    : 'Localisation non autorisée. Vous pouvez aussi choisir un point sur la carte.';
}
