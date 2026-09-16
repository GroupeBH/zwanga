import { Colors } from '@/constants/styles';

export const labelStatus = (status: string) => {
  switch (status) {
    case 'upcoming':
      return 'À venir';
    case 'ongoing':
      return 'En cours';
    case 'completed':
      return 'Terminé';
    case 'cancelled':
      return 'Annulé';
    default:
      return status;
  }
};

export const statusColor = (status: string) => {
  switch (status) {
    case 'upcoming':
      return { color: Colors.secondary };
    case 'ongoing':
      return { color: Colors.info };
    case 'completed':
      return { color: Colors.success };
    case 'cancelled':
    default:
      return { color: Colors.gray[600] };
  }
};
