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
  // undefined: missing/invalid server data; null: server confirmed no document.
  identity?: Pick<KycDocument, 'status' | 'provider' | 'diditSessionStatus' | 'rejectionReason'> | null;
  profileState?: ProfileState;
}

export interface ProfileState {
  version: 1;
  userId: string;
  identity: { status: 'not_started' | KycStatus; rejectionReason: string | null };
  driver: {
    status: 'not_requested' | 'identity_required' | 'identity_pending' | 'vehicle_required' | 'ready_to_activate' | 'active' | 'restricted';
    nextAction: 'start' | 'verify_identity' | 'add_vehicle' | 'wait' | 'activate' | 'none' | 'contact_support';
    canPublish: boolean;
    activeVehicleCount: number;
    requested: boolean;
  };
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
