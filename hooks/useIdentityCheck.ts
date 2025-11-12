import { useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

/**
 * Hook pour vérifier si l'utilisateur a vérifié son identité
 * Affiche une alerte et redirige si nécessaire
 */
export function useIdentityCheck() {
  const user = useAppSelector(selectUser);
  const router = useRouter();

  const checkIdentity = (action: 'publish' | 'book'): boolean => {
    if (!user?.identityVerified) {
      const actionText = action === 'publish' ? 'publier des trajets' : 'réserver des trajets';
      
      Alert.alert(
        'Vérification d\'identité requise',
        `Pour ${actionText}, vous devez vérifier votre identité en scannant votre carte d'identité et votre visage.`,
        [
          {
            text: 'Annuler',
            style: 'cancel',
          },
          {
            text: 'Vérifier maintenant',
            onPress: () => {
              // Rediriger vers les paramètres pour compléter la vérification
              router.push('/settings');
            },
          },
        ]
      );
      
      return false;
    }
    
    return true;
  };

  return { checkIdentity, isIdentityVerified: user?.identityVerified || false };
}

