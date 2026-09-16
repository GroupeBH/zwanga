import type { User } from './users';

export type KycStatus = 'pending' | 'approved' | 'rejected';

export interface KycDocument {
  id: string;
  userId: string;
  cniFrontUrl?: string | null;
  cniFrontUrls?: string[] | null;
  cniBackUrl?: string | null;
  selfieUrl?: string | null;
  status: KycStatus;
  provider?: 'legacy' | 'didit';
  rejectionReason?: string | null;
  diditSessionId?: string | null;
  diditSessionNumber?: number | null;
  diditWorkflowId?: string | null;
  diditVendorData?: string | null;
  diditSessionStatus?: string | null;
  diditLastSyncedAt?: string | null;
  providerMetadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileStats {
  vehicles: number;
  tripsAsDriver: number;
  bookingsAsPassenger: number;
  bookingsAsDriver: number;
  messagesSent: number;
}

export interface ProfileSummary {
  user: User;
  stats: ProfileStats;
}

export interface Review {
  id: string;
  ratedUserId: string;
  raterId: string;
  fromUserName?: string;
  fromUserAvatar?: string;
  rating: number;
  comment?: string;
  tripId?: string | null;
  createdAt: string; // ISO string date
}
