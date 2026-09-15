import type { UserRole } from './common';

export interface SupportFaqEntry {
  id: string;
  question: string;
  answer: string;
  category?: string | null;
  locale?: string | null;
  audience?: string | null;
  keywords?: string | null;
  isPublished?: boolean;
  order?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SupportPaginationMeta {
  page: number;
  limit: number;
  total: number;
}

export interface SupportFaqListResponse {
  data: SupportFaqEntry[];
  meta: SupportPaginationMeta;
}

export interface SupportConfigScheduleEntry {
  label: string;
  value: string;
}

export interface SupportConfig {
  locale: string;
  faq?: {
    locale?: string;
    audience?: string;
  };
  title: string;
  subtitle: string;
  contact: {
    phone?: string | null;
    whatsapp?: string | null;
    email?: string | null;
  };
  hours: SupportConfigScheduleEntry[];
  channels: {
    ticket: boolean;
    phone: boolean;
    whatsapp: boolean;
    email: boolean;
  };
}

export type SupportTicketStatus =
  | 'open'
  | 'in_progress'
  | 'waiting_user'
  | 'resolved'
  | 'closed';

export type SupportTicketPriority = 'low' | 'medium' | 'high' | 'urgent';

export type SupportTicketCategory =
  | 'general'
  | 'account'
  | 'payment'
  | 'booking'
  | 'safety'
  | 'technical'
  | 'other';

export interface SupportActorSummary {
  id: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface SupportTicketMessage {
  id: string;
  ticketId: string;
  senderId: string;
  content: string;
  isInternal: boolean;
  createdAt: string;
  sender: SupportActorSummary | null;
}

export interface SupportTicketSummary {
  id: string;
  userId: string;
  assignedAdminId: string | null;
  subject: string;
  category: SupportTicketCategory;
  priority: SupportTicketPriority;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  resolutionSummary: string | null;
  user: SupportActorSummary | null;
  assignedAdmin: SupportActorSummary | null;
}

export interface SupportTicketDetails extends SupportTicketSummary {
  messages: SupportTicketMessage[];
}

export interface SupportTicketListResponse {
  data: SupportTicketSummary[];
  meta: SupportPaginationMeta;
}
