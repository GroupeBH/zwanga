import { Colors } from '@/constants/styles';
import { type BookingAutoProgressPayload } from '@/services/trackingSocket';
import type { Booking, BookingStatus } from '@/types';

export type FeedbackState = { type: 'success' | 'error'; message: string } | null;

export const BOOKING_STATUS_CONFIG: Record<
  BookingStatus,
  { label: string; color: string; background: string }
> = {
  pending: {
    label: 'En attente',
    color: Colors.secondary,
    background: 'rgba(247, 184, 1, 0.15)',
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

export const hasPassengerBoarded = (booking: Booking) =>
  Boolean(booking.pickedUp || booking.pickedUpConfirmedByPassenger);

export const hasPassengerDroppedOff = (booking: Booking) =>
  Boolean(
    booking.status === 'completed' ||
      booking.droppedOff ||
      booking.droppedOffConfirmedByPassenger ||
      booking.droppedOffAt ||
      booking.droppedOffConfirmedAt,
  );

export type ManageAutoProgressEvent = BookingAutoProgressPayload['events'][number];

export const MANAGE_AUTO_PROGRESS_PRIORITY: Record<ManageAutoProgressEvent['type'], number> = {
  driver_near_pickup: 0,
  driver_arrived_pickup: 1,
  parties_nearby: 2,
  passenger_ready_pickup: 3,
  pickup_confirmed: 4,
  passenger_no_show: 5,
  passenger_boarding_uncertain: 6,
  passenger_near_destination: 7,
  dropoff_confirmed: 8,
  driver_near_destination: 9,
  driver_arrived_destination: 10,
};
