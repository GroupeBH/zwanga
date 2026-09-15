import { type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';

export type DialogVariant = 'info' | 'success' | 'warning' | 'danger';

export interface DialogAction {
  label: string;
  onPress?: () => unknown;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive';
  autoClose?: boolean;
}

export interface DialogOptions {
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  previewImageUri?: string;
  content?: ReactNode;
  variant?: DialogVariant;
  actions?: DialogAction[];
  dismissible?: boolean;
}

export interface DialogState extends DialogOptions {
  visible: boolean;
}

export interface PendingDialogAction {
  action: DialogAction;
  dialog: DialogState | null;
}

export interface DialogContextValue {
  showDialog: (options: DialogOptions) => void;
  hideDialog: () => void;
}
