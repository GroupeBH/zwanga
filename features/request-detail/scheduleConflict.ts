import type { Href } from 'expo-router';
import type { DialogOptions } from '@/features/dialogs/dialogTypes';
import { formatDateWithRelativeLabel } from '@/utils/dateHelpers';
import { isInvitationId } from '@/features/notifications/driverInvitation';
import { getTokenSessionVersion } from '@/services/tokenSession';

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
const label = (value: unknown) => {
  const text = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  return text.length > 96 ? `${text.slice(0, 95)}…` : text;
};

/** Use the rejected operation's server result, never guess a conflict from stale lists. */
export function driverScheduleConflictDialog(
  error: unknown, userId: string | undefined, open: (href: Href) => void,
): DialogOptions | null {
  const root = record(error), data = record(root?.data);
  const body = [data, record(data?.error), record(root?.error), root].find(value =>
    value?.code === 'DRIVER_SCHEDULE_CONFLICT' || value?.code === 'SHARED_TRIP_OFFER_REQUIRED');
  if (!body) return null;
  const conflict = record(body.conflict);
  const own = Boolean(userId && conflict?.driverId === userId);
  const valid = own && isInvitationId(conflict?.id) &&
    (conflict?.kind === 'trip' || conflict?.kind === 'request') &&
    typeof conflict.departureDate === 'string' && Number.isFinite(Date.parse(conflict.departureDate));
  const ongoing = valid && conflict?.status === 'ongoing';
  const description = valid
    ? `${ongoing ? 'En cours' : conflict?.status === 'preparing' ? 'Prise en charge en préparation' : 'Déjà prévu'} · ${formatDateWithRelativeLabel(conflict!.departureDate as string, true)}\n\nDépart : ${label(conflict!.departure) || 'Lieu non renseigné'}\nArrivée : ${label(conflict!.arrival) || 'Lieu non renseigné'}`
    : 'Une autre course vous empêche d’accepter cette demande. Retrouvez-la dans « Mes trajets ».';
  const explanation = body.code === 'SHARED_TRIP_OFFER_REQUIRED'
    ? 'Pour proposer le partage du trajet en cours, l’accord du passager est nécessaire.'
    : 'Les horaires, y compris le temps nécessaire entre deux courses, ne sont pas compatibles.';
  const target: Href = !valid ? '/(tabs)/trips' : conflict?.kind === 'request'
    ? { pathname: '/request-details/[id]', params: { id: conflict.id as string } }
    : { pathname: ongoing ? '/trip/navigate/[id]' : '/trip/manage/[id]', params: { id: conflict!.id as string } };
  const session = getTokenSessionVersion();
  return { title: ongoing ? 'Un trajet est déjà en cours' : 'Vous avez déjà une course prévue',
    message: `${description}\n\n${explanation}`,
    variant: 'warning', icon: 'calendar-outline',
    actions: [
      { label: 'Rester ici', variant: 'ghost' },
      { label: valid ? 'Voir ce trajet' : 'Mes trajets', variant: 'primary',
        onPress: () => { if (session === getTokenSessionVersion()) open(target); } },
    ],
  };
}
