import { useDialog } from '@/components/ui/DialogProvider';
import { clearTokens } from '@/services/tokenStorage';
import { baseApi } from '@/store/api/baseApi';
import { useDeleteAccountMutation } from '@/store/api/userApi';
import { useAppDispatch } from '@/store/hooks';
import { logout } from '@/store/slices/authSlice';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { Router } from 'expo-router';

interface Params {
  showDialog: ReturnType<typeof useDialog>['showDialog'];
  deleteAccount: ReturnType<typeof useDeleteAccountMutation>[0];
  hideDialog: () => void;
  dispatch: ReturnType<typeof useAppDispatch>;
  router: Router;
  changeProfilePhoto: () => Promise<boolean>;
}

export function useSettingsAccountActions({
  showDialog,
  deleteAccount,
  hideDialog,
  dispatch,
  router,
  changeProfilePhoto,
}: Params) {
  const handleDeleteAccount = () => {
    showDialog({
      variant: 'danger',
      title: 'Supprimer le compte',
      message:
        'Votre compte sera désactivé et vos données sensibles seront supprimées. Cette action est irréversible.',
      actions: [
        { label: 'Annuler', variant: 'ghost' },
        {
          label: 'Supprimer',
          variant: 'primary',
          autoClose: false,
          onPress: async () => {
            try {
              await deleteAccount().unwrap();
              hideDialog();
              await clearTokens();
              dispatch(logout());
              dispatch(baseApi.util.resetApiState());
              router.replace('/auth-entry');
            } catch (error) {
              showDialog({
                variant: 'danger',
                title: 'Suppression impossible',
                message: getApiErrorMessage(
                  error,
                  'Impossible de supprimer le compte pour le moment.',
                ),
              });
            }
          },
        },
      ],
    });
  };

  const accountItems = [
    { 
      icon: 'person-outline', 
      label: 'Modifier le profil', 
      route: '/edit-profile',
    },
    { 
      icon: 'image-outline', 
      label: 'Changer la photo de profil', 
      route: null,
      onPress: changeProfilePhoto,
    },
    { icon: 'receipt-outline', label: 'Historique paiements', route: '/payment-history' },
    { icon: 'wallet-outline', label: 'Jetons Zwanga', route: '/wallet' },
    { icon: 'gift-outline', label: 'Parrainage et gains', route: '/referrals' },
    { icon: 'lock-closed-outline', label: 'Sécurité', route: '/security' },
  ];

  return {
    accountItems,
    handleDeleteAccount,
  };
}
