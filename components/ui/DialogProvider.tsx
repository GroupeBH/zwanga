import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';

type DialogVariant = 'info' | 'success' | 'warning' | 'danger';

interface DialogAction {
  label: string;
  onPress?: () => unknown;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'destructive';
  autoClose?: boolean;
}

interface DialogOptions {
  title: string;
  message?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: DialogVariant;
  actions?: DialogAction[];
  dismissible?: boolean;
}

interface DialogState extends DialogOptions {
  visible: boolean;
}

interface DialogContextValue {
  showDialog: (options: DialogOptions) => void;
  hideDialog: () => void;
}

const DialogContext = createContext<DialogContextValue | undefined>(undefined);

const VARIANT_CONFIG: Record<
  DialogVariant,
  { icon: keyof typeof Ionicons.glyphMap; accent: string; background: string }
> = {
  info: {
    icon: 'information-circle',
    accent: Colors.info,
    background: 'rgba(52, 152, 219, 0.12)',
  },
  success: {
    icon: 'checkmark-circle',
    accent: Colors.success,
    background: 'rgba(46, 204, 113, 0.12)',
  },
  warning: {
    icon: 'warning',
    accent: Colors.warning,
    background: 'rgba(247, 184, 1, 0.16)',
  },
  danger: {
    icon: 'alert-circle',
    accent: Colors.danger,
    background: 'rgba(239, 68, 68, 0.14)',
  },
};

export function DialogProvider({ children }: { children: ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [runningActionLabel, setRunningActionLabel] = useState<string | null>(null);

  const hideDialog = useCallback(() => {
    setDialog(null);
    setRunningActionLabel(null);
  }, []);

  const showDialog = useCallback(
    (options: DialogOptions) => {
      const variant = options.variant ?? 'info';
      setDialog({
        visible: true,
        variant,
        icon: options.icon ?? VARIANT_CONFIG[variant].icon,
        dismissible: options.dismissible ?? true,
        title: options.title,
        message: options.message,
        actions:
          options.actions && options.actions.length > 0
            ? options.actions
            : [{ label: 'Fermer', variant: 'primary' }],
      });
    },
    [],
  );

  const value = useMemo(() => ({ showDialog, hideDialog }), [showDialog, hideDialog]);

  const currentVariant = dialog?.variant ?? 'info';
  const variantStyle = VARIANT_CONFIG[currentVariant];

  const handleActionPress = async (action: DialogAction) => {
    if (runningActionLabel) return;

    if (!action.onPress) {
      hideDialog();
      return;
    }

    const activeDialog = dialog;
    setRunningActionLabel(action.label);

    try {
      await action.onPress();
      if (action.autoClose !== false) {
        setDialog((currentDialog) => (currentDialog === activeDialog ? null : currentDialog));
      }
    } catch (error) {
      console.error(`[DialogProvider] Action failed: ${action.label}`, error);
      setDialog((currentDialog) =>
        currentDialog === activeDialog
          ? {
              visible: true,
              variant: 'danger',
              icon: VARIANT_CONFIG.danger.icon,
              dismissible: true,
              title: 'Action impossible',
              message: 'Une erreur inattendue est survenue. Veuillez réessayer.',
              actions: [{ label: 'Fermer', variant: 'primary' }],
            }
          : currentDialog,
      );
    } finally {
      setRunningActionLabel(null);
    }
  };

  return (
    <DialogContext.Provider value={value}>
      {children}
      <Modal visible={dialog?.visible ?? false} transparent animationType="fade" onRequestClose={hideDialog}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <View style={[styles.iconWrapper, { backgroundColor: variantStyle.background }]}>
              <View style={[styles.iconBadge, { backgroundColor: variantStyle.accent }]}>
                <Ionicons name={dialog?.icon ?? variantStyle.icon} size={28} color={Colors.white} />
              </View>
            </View>
            <Text style={styles.title}>{dialog?.title}</Text>
            {dialog?.message ? <Text style={styles.message}>{dialog.message}</Text> : null}
            <View style={styles.actions}>
              {dialog?.actions?.map((action) => (
                <TouchableOpacity
                  key={action.label}
                  onPress={() => handleActionPress(action)}
                  disabled={Boolean(runningActionLabel)}
                  style={[
                    styles.actionButton,
                    action.variant === 'primary' && styles.actionPrimary,
                    action.variant === 'secondary' && styles.actionSecondary,
                    action.variant === 'ghost' && styles.actionGhost,
                    (action.variant === 'danger' || action.variant === 'destructive') &&
                      styles.actionDanger,
                    runningActionLabel && action.label !== runningActionLabel && styles.actionDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.actionText,
                      action.variant === 'primary' && styles.actionTextPrimary,
                      action.variant === 'ghost' && styles.actionTextGhost,
                      (action.variant === 'danger' || action.variant === 'destructive') &&
                        styles.actionTextDanger,
                    ]}
                  >
                    {action.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </Modal>
    </DialogContext.Provider>
  );
}

export function useDialog() {
  const context = useContext(DialogContext);
  if (!context) {
    throw new Error('useDialog must be used within a DialogProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15,15,15,0.7)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xxl,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.md,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    textAlign: 'center',
  },
  message: {
    fontSize: FontSizes.base,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    width: '100%',
    gap: Spacing.sm,
    marginTop: Spacing.sm,
  },
  actionButton: {
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  actionPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  actionSecondary: {
    backgroundColor: Colors.gray[100],
    borderColor: Colors.gray[100],
  },
  actionGhost: {
    borderColor: 'transparent',
  },
  actionDanger: {
    borderColor: Colors.danger + '30',
    backgroundColor: Colors.danger + '08',
  },
  actionDisabled: {
    opacity: 0.5,
  },
  actionText: {
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  actionTextPrimary: {
    color: Colors.white,
  },
  actionTextGhost: {
    color: Colors.gray[600],
  },
  actionTextDanger: {
    color: Colors.danger,
  },
});
