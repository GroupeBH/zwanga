import { Colors } from '@/constants/styles';
import type { BookingStatus } from '@/types';

export type BookingTab = 'active' | 'history';

export const STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; color: string; background: string }
> = {
  pending: {
    label: 'En attente',
    color: Colors.secondary,
    background: 'rgba(247, 184, 1, 0.2)',
  },
  accepted: {
    label: 'Confirmée',
    color: Colors.success,
    background: 'rgba(46, 204, 113, 0.18)',
  },
  rejected: {
    label: 'Refusée',
    color: Colors.danger,
    background: 'rgba(239, 68, 68, 0.16)',
  },
  cancelled: {
    label: 'Annulée',
    color: Colors.gray[600],
    background: 'rgba(156, 163, 175, 0.2)',
  },
  no_show: {
    label: 'Non embarqué',
    color: Colors.danger,
    background: 'rgba(239, 68, 68, 0.12)',
  },
  boarding_uncertain: {
    label: 'Embarquement non confirmé',
    color: Colors.warning,
    background: 'rgba(245, 158, 11, 0.14)',
  },
  completed: {
    label: 'Terminée',
    color: Colors.gray[600],
    background: 'rgba(107, 114, 128, 0.18)',
  },
  expired: {
    label: 'Expirée',
    color: Colors.gray[600],
    background: 'rgba(156, 163, 175, 0.2)',
  },
};
