export type ServiceCode = "documents" | "vehicles" | "equipment" | "fleet";
export type ServiceStatus =
  | "submitted"
  | "reviewing"
  | "needs_info"
  | "quoted"
  | "accepted"
  | "processing"
  | "ready"
  | "completed"
  | "rejected"
  | "cancelled";
export interface ProOffering {
  code: ServiceCode;
  name: string;
  description: string;
  availability: "open" | "coming_soon" | "paused";
  engagementEnabled: boolean;
  documentOptions: { code: string; label: string }[];
}
export interface ProApplication {
  fullName: string;
  phone: string;
  vehicleDescription: string;
  plate?: string;
  documents: string[];
  description: string;
}
export interface ProCaseRow {
  id: string;
  serviceCode: ServiceCode;
  status: ServiceStatus;
  createdAt: string;
  fullName: string;
  customerMessage: string;
}
export interface ProQuote {
  version: number;
  currency: string;
  totalMinor: number;
  depositMinor: number;
  providerName: string;
  description: string;
  validUntil: string;
  installments: { dueDate: string; amountMinor: number }[];
  retainedDocuments: { code: string; label: string }[];
  terms: { version: string; text: string } | null;
}
export interface ProCase extends ProCaseRow {
  application: ProApplication;
  quote: ProQuote | null;
  canAccept: boolean;
  acceptedAt: string | null;
  finances: {
    currency: string | null;
    fundedMinor: number;
    repaidMinor: number;
    balanceMinor: number;
    depositPaidMinor: number;
    settled: boolean;
    installments: {
      dueDate: string;
      amountMinor: number;
      remainingMinor: number;
    }[];
  };
  documents: {
    id: string;
    code: string;
    label: string;
    status: "expected" | "held" | "release_ready" | "returned";
    receipt: string;
    returnReceipt: string;
  }[];
  events: { id: string; action: string; createdAt: string }[];
}
