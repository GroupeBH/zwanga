import { Colors } from '@/constants/styles';
import type {
  SupportConfig,
  SupportFaqEntry,
  SupportTicketCategory,
  SupportTicketStatus,
} from '@/types';
import { Ionicons } from '@expo/vector-icons';

export const FAVORITE_CONTACT_KEY = 'support_favorite_contact';
export const FAQ_HISTORY_KEY = 'support_faq_history';
export const SEARCH_HISTORY_KEY = 'support_search_history';
export const FAQ_LIMIT = 100;
export const DEFAULT_SUPPORT_EMAIL = 'support@zwanga.cd';

export type SupportContactPreference = 'ticket' | 'email' | 'phone' | 'whatsapp';

export interface SupportQuickAction {
  key: SupportContactPreference;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  color: string;
}

export const LOCAL_FAQ_ENTRIES: SupportFaqEntry[] = [
  {
    id: 'local-start-account',
    category: 'demarrage',
    question: 'Comment créer mon compte ?',
    answer:
      'Entrez votre numéro de téléphone, confirmez le code SMS, puis complétez votre profil à votre rythme.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'local-start-kyc',
    category: 'demarrage',
    question: "À quoi sert la vérification d'identité ?",
    answer:
      "Elle renforce la confiance entre conducteurs et passagers. Si une étape vous bloque, ouvrez un ticket depuis cet écran.",
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'local-trip-search',
    category: 'trajets',
    question: 'Comment chercher un trajet ?',
    answer:
      "Depuis l'accueil, indiquez votre départ et votre destination, puis comparez les trajets proposés.",
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'local-trip-publish',
    category: 'trajets',
    question: 'Comment publier un trajet ?',
    answer:
      "Appuyez sur Publier, choisissez votre itinéraire, l'heure, le nombre de places et le prix, puis confirmez.",
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'local-payment-methods',
    category: 'paiements',
    question: 'Quels paiements sont acceptés ?',
    answer:
      'Selon le trajet, vous pouvez payer en espèces, Orange Money, M-Pesa ou Airtel Money.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'local-safety-emergency',
    category: 'securite',
    question: "Que faire en cas d'urgence ?",
    answer:
      "Utilisez les options de sécurité dans l'application et contactez le support si vous avez besoin d'un suivi.",
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'local-profile-edit',
    category: 'compte',
    question: 'Comment modifier mon profil ?',
    answer:
      'Allez dans votre profil puis choisissez Modifier le profil pour mettre à jour vos informations.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'local-support-ticket',
    category: 'support',
    question: 'Comment contacter le support ?',
    answer:
      'Vous pouvez créer un ticket depuis cet écran. Décrivez simplement votre problème en quelques phrases.',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

export const FAQ_CATEGORY_META: Record<
  string,
  { title: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  demarrage: { title: 'Démarrage', icon: 'rocket' },
  trajets: { title: 'Trajets', icon: 'car' },
  paiements: { title: 'Paiements', icon: 'card' },
  securite: { title: 'Sécurité', icon: 'shield-checkmark' },
  compte: { title: 'Compte', icon: 'person' },
  support: { title: 'Support', icon: 'help-buoy' },
  general: { title: 'Général', icon: 'help-circle' },
  booking: { title: 'Réservations', icon: 'ticket' },
  payment: { title: 'Paiements', icon: 'card' },
  account: { title: 'Compte', icon: 'person' },
  safety: { title: 'Sécurité', icon: 'shield-checkmark' },
  technical: { title: 'Technique', icon: 'construct' },
  other: { title: 'Autre', icon: 'apps' },
};

export const TICKET_CATEGORY_LABELS: Record<SupportTicketCategory, string> = {
  general: 'Général',
  account: 'Compte',
  payment: 'Paiement',
  booking: 'Réservation',
  safety: 'Sécurité',
  technical: 'Technique',
  other: 'Autre',
};

export const TICKET_STATUS_META: Record<
  SupportTicketStatus,
  { label: string; color: string; backgroundColor: string }
> = {
  open: {
    label: 'Ouvert',
    color: Colors.primaryDark,
    backgroundColor: `${Colors.primary}18`,
  },
  in_progress: {
    label: 'En cours',
    color: Colors.infoDark,
    backgroundColor: `${Colors.info}18`,
  },
  waiting_user: {
    label: 'Votre retour',
    color: Colors.warningDark,
    backgroundColor: `${Colors.warning}18`,
  },
  resolved: {
    label: 'Résolue',
    color: Colors.successDark,
    backgroundColor: `${Colors.success}18`,
  },
  closed: {
    label: 'Fermé',
    color: Colors.gray[700],
    backgroundColor: Colors.gray[200],
  },
};

export const DEFAULT_SUPPORT_CONFIG: SupportConfig = {
  locale: 'fr-CD',
  faq: {
    locale: 'fr-CD',
    audience: 'mobile',
  },
  title: 'Une aide simple pour tous',
  subtitle: 'Cherchez une réponse ou laissez-nous un message si quelque chose vous bloque.',
  contact: {
    email: DEFAULT_SUPPORT_EMAIL,
    phone: null,
    whatsapp: null,
  },
  hours: [
    { label: 'Lundi - Vendredi', value: '8h00 - 20h00' },
    { label: 'Samedi', value: '9h00 - 18h00' },
    { label: 'Dimanche', value: '10h00 - 16h00' },
  ],
  channels: {
    ticket: true,
    phone: false,
    whatsapp: false,
    email: true,
  },
};

export const buildQuickActions = (config?: SupportConfig): SupportQuickAction[] => {
  const effectiveConfig = config ?? DEFAULT_SUPPORT_CONFIG;
  const actions: SupportQuickAction[] = [];

  if (effectiveConfig.channels.ticket) {
    actions.push({
      key: 'ticket',
      icon: 'chatbox-ellipses',
      label: 'Créer un ticket',
      description: 'Écrire simplement votre problème',
      color: Colors.primary,
    });
  }

  if (effectiveConfig.channels.phone && effectiveConfig.contact.phone) {
    actions.push({
      key: 'phone',
      icon: 'call',
      label: 'Appeler le support',
      description: 'Utile si vous préférez parler à un agent',
      color: Colors.success,
    });
  }

  if (effectiveConfig.channels.whatsapp && effectiveConfig.contact.whatsapp) {
    actions.push({
      key: 'whatsapp',
      icon: 'logo-whatsapp',
      label: 'Ouvrir WhatsApp',
      description: 'Pratique pour envoyer un message vocal ou texte',
      color: Colors.successDark,
    });
  }

  if (effectiveConfig.channels.email && effectiveConfig.contact.email) {
    actions.push({
      key: 'email',
      icon: 'mail',
      label: 'Envoyer un email',
      description: 'Utile si vous préférez un message écrit',
      color: Colors.info,
    });
  }

  return actions;
};

export const TICKET_CATEGORIES: SupportTicketCategory[] = [
  'general',
  'booking',
  'payment',
  'account',
  'safety',
  'technical',
  'other',
];

export const normalizeText = (value?: string | null) =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

export const normalizeFaqCategory = (category?: string | null) => {
  const normalized = normalizeText(category);
  return normalized || 'general';
};

export const humanizeCategory = (category?: string | null) => {
  if (!category) {
    return 'Général';
  }

  const clean = category.trim();
  return clean.charAt(0).toUpperCase() + clean.slice(1);
};

export const getFaqCategoryMeta = (category?: string | null) => {
  const key = normalizeFaqCategory(category);
  return FAQ_CATEGORY_META[key] ?? {
    title: humanizeCategory(category),
    icon: 'help-circle' as const,
  };
};

export const formatSupportDate = (value?: string | null) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
};

export const buildApiErrorMessage = (error: any, fallbackMessage: string) => {
  const message = error?.data?.message;

  if (Array.isArray(message) && message.length > 0) {
    return message.join('\n');
  }

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  if (typeof error?.data === 'string' && error.data.trim()) {
    return error.data;
  }

  return fallbackMessage;
};
