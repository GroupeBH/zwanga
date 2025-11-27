import { useIdentityContext } from '@/contexts/IdentityContext';

/**
 * Expose la vérification d'identité centralisée depuis le contexte global.
 * À utiliser dans n'importe quel écran ou composant qui doit restreindre une action.
 */
export function useIdentityCheck() {
  return useIdentityContext();
}