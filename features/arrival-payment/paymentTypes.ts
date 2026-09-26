import { Ionicons } from '@expo/vector-icons';
import type { SubscriptionPaymentMethod, TripPaymentMode } from '@/types';

export type PaymentChannel = 'mpesa' | 'airtel' | 'orange' | 'card';

export type StoredBookingPaymentState = {
  settledAt?: string;
  requiredActionAt?: string;
  acknowledgedAt?: string;
  preArrivalDismissedAt?: string;
  bookingPaymentOrderNumber?: string;
  bookingPaymentMethod?: SubscriptionPaymentMethod;
  bookingPaymentChannel?: PaymentChannel;
  bookingPaymentUrl?: string;
  walletTopUpOrderNumber?: string;
};

export type StoredPaymentState = Record<string, StoredBookingPaymentState>;

export type PaymentOption = {
  id: TripPaymentMode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
};

export type ElectronicPaymentChannel = {
  id: PaymentChannel;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
};

export type PaymentCompletionSummary = {
  cashInstructions?: boolean;
  bookingId: string;
  beforeArrival?: boolean;
  mode: TripPaymentMode;
  channel?: PaymentChannel;
  amount: number;
  currency: string;
  walletBalance: number | null;
  earnedPoints: number;
  earnedPointsKnown: boolean;
  invoiceUrl?: string | null;
  paymentHistoryId?: string | null;
  paymentReference?: string | null;
  driverNotice: string;
};

export const PAYMENT_OPTIONS: PaymentOption[] = [
  {
    id: 'electronic',
    icon: 'phone-portrait-outline',
    title: 'Mobile Money',
    description: 'Paiement sécurisé sur votre téléphone',
  },
  {
    id: 'points',
    icon: 'wallet-outline',
    title: 'Jetons Zwanga',
    description: 'Utilisez vos jetons et complétez si nécessaire',
  },
  {
    id: 'cash',
    icon: 'cash-outline',
    title: 'Espèces',
    description: 'Remettez le montant au conducteur',
  },
];

export const ELECTRONIC_PAYMENT_CHANNELS: ElectronicPaymentChannel[] = [
  {
    id: 'mpesa',
    icon: 'phone-portrait-outline',
    title: 'M-Pesa',
    description: 'Confirmation par code PIN sur votre téléphone',
  },
  {
    id: 'airtel',
    icon: 'phone-portrait-outline',
    title: 'Airtel Money',
    description: 'Confirmation par code PIN sur votre téléphone',
  },
  {
    id: 'orange',
    icon: 'phone-portrait-outline',
    title: 'Orange Money',
    description: 'Confirmation par code PIN sur votre téléphone',
  },
  {
    id: 'card',
    icon: 'card-outline',
    title: 'Carte',
    description: 'Paiement sécurisé par carte bancaire',
  },
];
