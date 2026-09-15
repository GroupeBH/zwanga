import type { KycDocument, KycStatus } from '@/types';
import type { VerificationResult } from '@didit-protocol/sdk-react-native';

export type QueryParams = Record<string, string | string[] | undefined>;

export type DiditKycFlowOutcome = {
  kyc: KycDocument | null;
  status: KycStatus | null;
  diditStatus?: string | null;
  sessionId?: string | null;
  launchMode?: 'native_sdk' | 'web_browser';
  sdkResultType?: VerificationResult['type'];
  browserResultType?: string;
};

export type StartDiditKycOptions = {
  showResultDialog?: boolean;
  skipLegalIdentityConfirmation?: boolean;
};

export type UseDiditKycFlowOptions = {
  sourceScreen: string;
  onStatusRefresh?: () => Promise<unknown> | unknown;
  onApproved?: (outcome: DiditKycFlowOutcome) => Promise<unknown> | unknown;
  approvedMessage?: string;
  pendingMessage?: string;
};

export type KycFlowStage =
  | 'loading_user'
  | 'confirming_identity'
  | 'creating_session'
  | 'opening_native_sdk'
  | 'opening_web_browser'
  | 'syncing_session'
  | 'refreshing_status'
  | 'handling_result';

export type KycErrorCategory =
  | 'interrupted'
  | 'network'
  | 'camera'
  | 'session_expired'
  | 'authentication'
  | 'rate_limited'
  | 'service_unavailable'
  | 'unknown';

export type KycErrorPresentation = {
  category: KycErrorCategory;
  code: string;
  title: string;
  message: string;
};
