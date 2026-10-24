import { useCallback, useRef } from 'react';
import { useRouter } from 'expo-router';
import { useDialog } from '@/components/ui/DialogProvider';
import { hasCompleteLegalIdentity, normalizeLegalName } from '@/utils/legalIdentity';
import { useKycFlowScope } from './useKycFlowScope';

/** Owns the identity dialog and cancels its pending answer when the route leaves. */
export function useKycLegalIdentityConfirmation() {
  const { showDialog } = useDialog();
  const router = useRouter();
  const confirmation = useRef<((confirmed: boolean) => void) | null>(null);
  const cancelConfirmation = useCallback(() => { confirmation.current?.(false); confirmation.current = null; }, []);
  const captureScope = useKycFlowScope(cancelConfirmation);

  const confirmLegalIdentity = useCallback(
    (firstNameValue?: string | null, lastNameValue?: string | null) => {
      const firstName = normalizeLegalName(firstNameValue);
      const lastName = normalizeLegalName(lastNameValue);

      return new Promise<boolean>((resolve) => {
        const scope = captureScope();
        const finish = (confirmed: boolean) => { confirmation.current = null; resolve(confirmed); };
        confirmation.current = finish;
        const editIdentity = () => {
          finish(false);
          if (scope.canLaunch()) router.push('/edit-profile');
        };

        if (!hasCompleteLegalIdentity(firstName, lastName)) {
          showDialog({
            variant: 'warning',
            title: 'Noms légaux requis',
            message:
              'Renseignez vos prénom(s) et votre nom exactement comme sur votre pièce d’identité avant de lancer Didit. Le post-nom est facultatif.',
            dismissible: false,
            actions: [
              {
                label: 'Compléter mon profil',
                variant: 'primary',
                onPress: editIdentity,
              },
            ],
          });
          return;
        }

        showDialog({
          variant: 'info',
          icon: 'id-card-outline',
          title: 'Confirmez vos noms légaux',
          message:
            `Prénom(s) : ${firstName}\nNom : ${lastName}\n\n` +
            'Didit comparera ces informations à votre pièce d’identité. Corrigez-les avant de continuer si elles ne sont pas identiques.',
          dismissible: false,
          actions: [
            {
              label: 'Modifier mes noms',
              variant: 'secondary',
              onPress: editIdentity,
            },
            {
              label: 'Confirmer et continuer',
              variant: 'primary',
              onPress: () => finish(scope.canLaunch()),
            },
          ],
        });
      });
    },
    [captureScope, router, showDialog],
  );

  return { captureScope, confirmLegalIdentity };
}
