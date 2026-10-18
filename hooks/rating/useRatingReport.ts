import { useRef, useState } from 'react';
import { useCreateUserReportMutation } from '@/store/api/safetyApi';
import { useDialog } from '@/components/ui/DialogProvider';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import type { useRatingLifecycle } from './useRatingLifecycle';

const reasons = {
  dangerous: 'safety_concern', rude: 'inappropriate_behavior', dirty: 'other',
  late: 'other', 'no-show': 'other', overcharge: 'fraud',
} as const;

export function useRatingReport({ scopeKey, targetId, tripId, reason, description, captureRatingSession }: {
  scopeKey: string;
  targetId?: string | null; tripId: string; reason: string; description: string;
  captureRatingSession: ReturnType<typeof useRatingLifecycle>['captureRatingSession'];
}) {
  const [createReport, { isLoading }] = useCreateUserReportMutation();
  const { showDialog } = useDialog();
  const locked = useRef(false);
  const confirmed = useRef(new Set<string>());
  const [sentKeys, setSentKeys] = useState<Set<string>>(() => new Set());
  const key = `${scopeKey}:${targetId ?? ''}`;
  const latest = useRef(key);
  latest.current = key;
  const sent = sentKeys.has(key);
  const handleSubmitReport = async () => {
    const session = captureRatingSession();
    if (!session.canPresent() || locked.current || confirmed.current.has(key)) return;
    const apiReason = reasons[reason as keyof typeof reasons];
    if (!targetId || !tripId || !apiReason || description.trim().length < 10) {
      showDialog({ variant: 'warning', title: 'Complétez le signalement',
        message: 'Choisissez la personne et une raison, puis décrivez le problème en au moins 10 caractères.' });
      return;
    }
    locked.current = true;
    try {
      await createReport({ reportedUserId: targetId, tripId, reason: apiReason,
        description: description.trim() }).unwrap();
      // Remember success synchronously, before React renders the disabled button.
      confirmed.current.add(key);
      if (session.canUpdate()) setSentKeys(keys => new Set(keys).add(key));
      if (session.canPresent() && latest.current === key) showDialog({ variant: 'success', title: 'Signalement envoyé',
        message: 'Votre signalement a bien été enregistré. Notre équipe va l’examiner.' });
    } catch (error) {
      locked.current = false;
      if (session.canPresent() && latest.current === key) showDialog({ variant: 'danger', title: 'Envoi impossible',
        message: getApiErrorMessage(error, 'Le signalement n’a pas pu être confirmé. Réessayez plus tard.') });
    } finally { locked.current = false; }
  };
  return { handleSubmitReport, isSendingReport: isLoading, reportSent: sent };
}
