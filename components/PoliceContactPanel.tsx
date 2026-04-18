import { POLICE_CONTACTS } from '@/constants/policeContacts';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useDialog } from '@/components/ui/DialogProvider';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type PoliceContactPanelProps = {
  compact?: boolean;
  presentation?: 'full' | 'strip';
};

const normalizePhone = (phone: string) => phone.replace(/[^\d+]/g, '');

export function PoliceContactPanel({ compact = false, presentation = 'full' }: PoliceContactPanelProps) {
  const { showDialog } = useDialog();

  const callPolice = async (phone: string) => {
    const url = `tel:${normalizePhone(phone)}`;
    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        showDialog({
          variant: 'warning',
          title: 'Appel indisponible',
          message: 'Votre appareil ne permet pas de lancer un appel pour le moment.',
        });
        return;
      }
      await Linking.openURL(url);
    } catch {
      showDialog({
        variant: 'danger',
        title: "Impossible d'appeler",
        message: 'Reessayez ou composez le numero directement depuis votre telephone.',
      });
    }
  };

  const openPoliceChooser = () => {
    showDialog({
      variant: 'danger',
      title: 'Appeler la police',
      message: 'Choisissez le numero a appeler maintenant.',
      actions: [
        ...POLICE_CONTACTS.map((contact) => ({
          label: `${contact.label} - ${contact.phone}`,
          variant: 'primary' as const,
          onPress: () => void callPolice(contact.phone),
        })),
        { label: 'Annuler', variant: 'ghost' as const },
      ],
    });
  };

  if (presentation === 'strip') {
    return (
      <TouchableOpacity
        style={[styles.strip, compact && styles.stripCompact]}
        onPress={openPoliceChooser}
        activeOpacity={0.88}
      >
        <View style={styles.stripIcon}>
          <Ionicons name="call" size={17} color={Colors.danger} />
        </View>
        <View style={styles.stripText}>
          <Text style={styles.stripTitle}>Urgence police</Text>
          <Text style={styles.stripSubtitle} numberOfLines={1}>
            4 numeros disponibles
          </Text>
        </View>
        <View style={styles.stripAction}>
          <Text style={styles.stripActionText}>Appeler</Text>
          <Ionicons name="chevron-forward" size={15} color={Colors.white} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="shield-checkmark" size={20} color={Colors.danger} />
        </View>
        <View style={styles.headerText}>
          <Text style={styles.title}>Contacter la police</Text>
          <Text style={styles.subtitle}>
            {"En cas de danger immediat, appelez directement l'un de ces numeros."}
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        {POLICE_CONTACTS.map((contact) => (
          <TouchableOpacity
            key={contact.id}
            style={styles.callButton}
            onPress={() => void callPolice(contact.phone)}
            activeOpacity={0.85}
          >
            <View style={styles.callIcon}>
              <Ionicons name="call" size={16} color={Colors.white} />
            </View>
            <View style={styles.callTextWrap}>
              <Text style={styles.callLabel}>{contact.label}</Text>
              <Text style={styles.callPhone}>{contact.phone}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    minHeight: 58,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.danger + '22',
    backgroundColor: Colors.danger + '08',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    padding: Spacing.sm,
  },
  stripCompact: {
    minHeight: 52,
  },
  stripIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.danger + '18',
  },
  stripText: {
    flex: 1,
    minWidth: 0,
  },
  stripTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  stripSubtitle: {
    marginTop: 1,
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
  stripAction: {
    minHeight: 34,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.danger,
    paddingHorizontal: Spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stripActionText: {
    color: Colors.white,
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.danger + '24',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  cardCompact: {
    padding: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.danger + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  subtitle: {
    marginTop: 2,
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    lineHeight: 17,
  },
  grid: {
    gap: Spacing.sm,
  },
  callButton: {
    minHeight: 48,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[100],
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    gap: Spacing.sm,
  },
  callIcon: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callTextWrap: {
    flex: 1,
  },
  callLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  callPhone: {
    marginTop: 1,
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
  },
});
