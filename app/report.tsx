import { useDialog } from '@/components/ui/DialogProvider';
import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useCreateUserReportMutation } from '@/store/api/safetyApi';
import type { ReportReason } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ReasonOption = {
  id: ReportReason;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

const REASONS: ReasonOption[] = [
  { id: 'inappropriate_behavior', label: 'Comportement inapproprie', icon: 'alert-circle' },
  { id: 'harassment', label: 'Harcelement', icon: 'warning' },
  { id: 'safety_concern', label: 'Probleme de securite', icon: 'shield' },
  { id: 'fraud', label: 'Fraude', icon: 'cash' },
  { id: 'other', label: 'Autre', icon: 'ellipsis-horizontal-circle' },
];

export default function ReportScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { showDialog } = useDialog();
  const [createUserReport, { isLoading }] = useCreateUserReportMutation();

  const tripId = typeof params.tripId === 'string' ? params.tripId : '';
  const bookingId = typeof params.bookingId === 'string' ? params.bookingId : '';
  const reportedUserId = typeof params.reportedUserId === 'string' ? params.reportedUserId : '';
  const reportedUserName =
    typeof params.reportedUserName === 'string' ? params.reportedUserName : 'cet utilisateur';

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');

  const canSubmit = useMemo(
    () => Boolean(reason) && description.trim().length >= 10 && Boolean(reportedUserId),
    [reason, description, reportedUserId],
  );

  const handleSubmit = async () => {
    if (!tripId || !reportedUserId || !reason) {
      showDialog({
        title: 'Informations manquantes',
        message: 'Impossible de preparer le signalement pour ce trajet.',
        variant: 'danger',
      });
      return;
    }

    const cleanDescription = description.trim();
    if (cleanDescription.length < 10) {
      showDialog({
        title: 'Description requise',
        message: 'Merci de decrire le probleme avec au moins 10 caracteres.',
        variant: 'warning',
      });
      return;
    }

    try {
      await createUserReport({
        reportedUserId,
        reason,
        description: cleanDescription,
        tripId,
        ...(bookingId ? { bookingId } : {}),
      }).unwrap();

      showDialog({
        title: 'Signalement envoye',
        message: 'Merci. Votre signalement a ete transmis a notre equipe.',
        variant: 'success',
        actions: [{ label: 'Retour', variant: 'primary', onPress: () => router.back() }],
      });
    } catch (error: any) {
      const message =
        error?.data?.message ??
        error?.error ??
        'Impossible d envoyer le signalement pour le moment.';
      showDialog({
        title: 'Erreur',
        message: Array.isArray(message) ? message.join('\n') : message,
        variant: 'danger',
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Signaler un probleme</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.infoCard}>
          <Ionicons name="information-circle" size={20} color={Colors.info} />
          <Text style={styles.infoText}>
            Vous signalez: <Text style={styles.infoStrong}>{reportedUserName}</Text>
          </Text>
        </View>

        <Text style={styles.sectionTitle}>Raison</Text>
        {REASONS.map((option) => {
          const isSelected = reason === option.id;
          return (
            <TouchableOpacity
              key={option.id}
              style={[styles.reasonItem, isSelected && styles.reasonItemSelected]}
              onPress={() => setReason(option.id)}
              activeOpacity={0.85}
            >
              <View style={[styles.reasonIcon, isSelected && styles.reasonIconSelected]}>
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={isSelected ? Colors.white : Colors.gray[700]}
                />
              </View>
              <Text style={[styles.reasonText, isSelected && styles.reasonTextSelected]}>{option.label}</Text>
              {isSelected ? <Ionicons name="checkmark-circle" size={20} color={Colors.success} /> : null}
            </TouchableOpacity>
          );
        })}

        <Text style={styles.sectionTitle}>Description</Text>
        <TextInput
          style={styles.textArea}
          multiline
          value={description}
          onChangeText={setDescription}
          placeholder="Expliquez ce qui s est passe..."
          placeholderTextColor={Colors.gray[400]}
          textAlignVertical="top"
          maxLength={600}
        />
        <Text style={styles.counter}>{description.length}/600</Text>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
          disabled={!canSubmit || isLoading}
          onPress={handleSubmit}
          activeOpacity={0.9}
        >
          {isLoading ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.submitButtonText}>Envoyer le signalement</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  content: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.info + '10',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  infoText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    flex: 1,
  },
  infoStrong: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  sectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.sm,
  },
  reasonItemSelected: {
    borderColor: Colors.success,
    backgroundColor: Colors.success + '10',
  },
  reasonIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[100],
  },
  reasonIconSelected: {
    backgroundColor: Colors.success,
  },
  reasonText: {
    flex: 1,
    fontSize: FontSizes.base,
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
  },
  reasonTextSelected: {
    color: Colors.gray[900],
    fontWeight: FontWeights.bold,
  },
  textArea: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    minHeight: 140,
    padding: Spacing.md,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
    marginTop: Spacing.xs,
  },
  counter: {
    textAlign: 'right',
    marginTop: Spacing.xs,
    color: Colors.gray[500],
    fontSize: FontSizes.xs,
  },
  footer: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.lg,
    paddingTop: Spacing.sm,
  },
  submitButton: {
    height: 52,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  submitButtonText: {
    color: Colors.white,
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
  },
});
