export type AwsDocumentType = 'voter_card' | 'passport' | 'driving_license';
export type AwsKycSession = {
  id: string; kycId: string;
  state: 'uploading' | 'documents' | 'ready' | 'creating' | 'liveness' | 'compare' | 'review' | 'failed';
  status: 'pending' | 'approved' | 'rejected';
  nextAction: 'capture_liveness' | 'retry' | 'wait' | 'wait_review' | 'done';
  expiresAt: string; errorCode: string | null;
};
export type AwsLivenessStart = {
  id: string; sessionId: string; region: string; expiresAt: string;
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string; expiration: string };
};
export const AWS_KYC_CONSENT = 'aws-kyc-v1';
export const AWS_KYC_DOCUMENT_LABELS: Record<AwsDocumentType, string> = {
  voter_card: 'Carte d’électeur', passport: 'Passeport', driving_license: 'Permis de conduire',
};
