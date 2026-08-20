import {
  REGISTERED_VEHICLE_TYPE_OPTIONS,
  type RegisteredVehicleTypeOption,
} from '@/constants/vehicleTypes';
import type { TripRequestVehicleType } from '@/types';
import { TextInput } from 'react-native';

// Types
export type AuthMode = 'login' | 'signup';
export type AuthStep = 'phone' | 'sms' | 'pin' | 'profile' | 'kyc' | 'resetPin';
export type VehicleType = TripRequestVehicleType;
export type GoogleSignupStep = 'phone' | 'otp';
export type ResetPinMode = 'otp' | 'newPin';

// Step sequences
export const LOGIN_STEPS: AuthStep[] = ['phone', 'pin'];
export const SIGNUP_STEPS: AuthStep[] = ['phone', 'sms', 'pin', 'profile'];

// Vehicle options
export type VehicleOption = RegisteredVehicleTypeOption;

export const vehicleOptions: VehicleOption[] = REGISTERED_VEHICLE_TYPE_OPTIONS;

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
  selfie: string;
}

