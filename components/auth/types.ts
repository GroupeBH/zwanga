import { Ionicons } from '@expo/vector-icons';
import { TextInput } from 'react-native';

// Types
export type AuthMode = 'login' | 'signup';
export type AuthStep = 'phone' | 'sms' | 'pin' | 'profile' | 'kyc' | 'resetPin';
export type VehicleType = 'sedan' | 'suv' | 'van' | 'moto';
export type GoogleSignupStep = 'phone' | 'otp';
export type ResetPinStep = 'otp' | 'newPin';

// Step sequences
export const LOGIN_STEPS: AuthStep[] = ['phone', 'pin'];
export const SIGNUP_STEPS: AuthStep[] = ['phone', 'sms', 'pin', 'profile'];

// Vehicle options
export type VehicleOption = {
  id: VehicleType;
  label: string;
  description: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
};

export const vehicleOptions: VehicleOption[] = [
  {
    id: 'sedan',
    label: 'Berline',
    description: 'Confort 1-4 passagers',
    icon: 'car',
  },
  {
    id: 'suv',
    label: 'SUV / 4x4',
    description: 'Routes difficiles',
    icon: 'car-outline',
  },
  {
    id: 'van',
    label: 'Van / Mini-bus',
    description: 'Jusqu\'à 8 places',
    icon: 'bus',
  },
  {
    id: 'moto',
    label: 'Moto',
    description: 'Rapide & Agile',
    icon: 'bicycle',
  },
];

// Motivational messages per step
export const getMotivationalMessage = (step: AuthStep, mode: AuthMode): string => {
  const messages: Record<AuthStep, string> = {
    phone: '',
    sms: '🚀 Vérification en cours...',
    pin: mode === 'login' ? '🔐 Entrez votre code PIN' : '🔐 Créez votre code PIN',
    profile: '✨ Créez votre identité unique !',
    kyc: '🔒 Vérification d\'identité',
    resetPin: '🔑 Réinitialisation du PIN',
  };
  return messages[step];
};

// Shared props for step components
export interface StepComponentProps {
  onNext: () => void;
  onBack?: () => void;
}

// Form refs type
export interface AuthFormRefs {
  smsInputRefs: React.MutableRefObject<Array<TextInput | null>>;
  pinInputRef: React.MutableRefObject<TextInput | null>;
  pinConfirmInputRef: React.MutableRefObject<TextInput | null>;
  googleOtpRefs: React.MutableRefObject<Array<TextInput | null>>;
  resetOtpInputRefs: React.MutableRefObject<Array<TextInput | null>>;
  resetPinInputRef: React.MutableRefObject<TextInput | null>;
  resetPinConfirmInputRef: React.MutableRefObject<TextInput | null>;
}

// KYC files type (from KycWizardModal)
export interface KycFiles {
  front: string;
  back: string;
  selfie: string;
}

