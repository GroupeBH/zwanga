import type { KycDocument, KycStatus } from '../../../types';

export const currentUserTag = { type: 'User' as const, id: 'CURRENT' };
export const kycStatusTag = { type: 'KycStatus' as const, id: 'CURRENT' };
export const vehicleListTag = { type: 'Vehicle' as const, id: 'LIST' };
export const favoriteLocationsListTag = { type: 'FavoriteLocations' as const, id: 'LIST' };

export interface DiditKycSession {
  sessionId: string;
  sessionNumber?: number | null;
  sessionToken?: string | null;
  url: string;
  status?: string | null;
  vendorData?: string | null;
  workflowId?: string | null;
}

export type RawDiditKycSession = DiditKycSession & {
  session_id?: string;
  session_number?: number | null;
  session_token?: string | null;
  session_url?: string;
  verification_url?: string;
  vendor_data?: string | null;
  workflow_id?: string | null;
};

export type DiditKycSyncPayload = {
  sessionId?: string | null;
  status?: string | null;
};

export type RawDiditKycSyncResponse =
  | KycDocument
  | {
      kyc?: KycDocument | null;
      document?: KycDocument | null;
      status?: KycStatus | null;
      rejectionReason?: string | null;
    }
  | null;

export const mapDiditKycSession = (session: RawDiditKycSession): DiditKycSession => ({
  sessionId: session.sessionId ?? session.session_id ?? '',
  sessionNumber: session.sessionNumber ?? session.session_number ?? null,
  sessionToken: session.sessionToken ?? session.session_token ?? null,
  url: session.url ?? session.session_url ?? session.verification_url ?? '',
  status: session.status ?? null,
  vendorData: session.vendorData ?? session.vendor_data ?? null,
  workflowId: session.workflowId ?? session.workflow_id ?? null,
});

export const mapDiditKycSyncResponse = (response: RawDiditKycSyncResponse): KycDocument | null => {
  if (!response) {
    return null;
  }

  if ('kyc' in response || 'document' in response) {
    return response.kyc ?? response.document ?? null;
  }

  return response as KycDocument;
};
