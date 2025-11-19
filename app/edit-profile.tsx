import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useProfilePhoto } from '@/hooks/useProfilePhoto';
import { useGetProfileSummaryQuery, useUpdateUserMutation } from '@/store/api/userApi';
import { useAppDispatch } from '@/store/hooks';
import { updateUser as updateUserAction } from '@/store/slices/authSlice';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EditProfileScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data: profileSummary, isLoading: summaryLoading, refetch } = useGetProfileSummaryQuery();
  const [updateUserMutation, { isLoading: isSaving }] = useUpdateUserMutation();
  const { changeProfilePhoto, isUploading } = useProfilePhoto();

  const user = profileSummary?.user;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [wantsToBeDriver, setWantsToBeDriver] = useState(false);
  const [feedback, setFeedback] = useState<{ visible: boolean; success: boolean; message: string }>({
    visible: false,
    success: false,
    message: '',
  });

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName ?? '');
      setLastName(user.lastName ?? '');
      setPhone(user.phone ?? '');
      setWantsToBeDriver(Boolean(user.isDriver));
    }
  }, [user]);

  const canBecomeDriver = useMemo(() => !user?.isDriver, [user?.isDriver]);

  const handleSave = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      setFeedback({
        visible: true,
        success: false,
        message: 'Merci de renseigner votre prénom et votre nom.',
      });
      return;
    }
    try {
      const payload: Record<string, any> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
      };
      if (canBecomeDriver) {
        payload.wantsToBeDriver = wantsToBeDriver;
      }
      const updated = await updateUserMutation(payload).unwrap();
      dispatch(
        updateUserAction({
          id: updated.id,
          name: `${updated.firstName ?? ''} ${updated.lastName ?? ''}`.trim() || updated.name,
          firstName: updated.firstName,
          lastName: updated.lastName,
          phone: updated.phone,
          avatar: updated.profilePicture ?? updated.avatar,
          profilePicture: updated.profilePicture,
          isDriver: updated.isDriver,
        }),
      );
      await refetch();
      setFeedback({
        visible: true,
        success: true,
        message: 'Profil mis à jour avec succès.',
      });
    } catch (error: any) {
      const message = error?.data?.message ?? error?.error ?? 'Impossible de sauvegarder les informations.';
      setFeedback({
        visible: true,
        success: false,
        message: Array.isArray(message) ? message.join('\n') : message,
      });
    }
  };

  const handleChangePhoto = async () => {
    await changeProfilePhoto();
    await refetch();
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modifier mon profil</Text>
          <View style={styles.backButton} />
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Photo de profil</Text>
          <TouchableOpacity
            onPress={handleChangePhoto}
            style={styles.photoButton}
            disabled={isUploading}
          >
            {isUploading ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Ionicons name="camera" size={18} color={Colors.white} />
                <Text style={styles.photoButtonText}>Changer ma photo</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        <Animated.View entering={FadeInDown.delay(100)} style={styles.card}>
          <Text style={styles.sectionTitle}>Informations personnelles</Text>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Prénom</Text>
            <TextInput
              style={styles.input}
              placeholder="Prénom"
              placeholderTextColor={Colors.gray[400]}
              value={firstName}
              onChangeText={setFirstName}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nom</Text>
            <TextInput
              style={styles.input}
              placeholder="Nom"
              placeholderTextColor={Colors.gray[400]}
              value={lastName}
              onChangeText={setLastName}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Téléphone</Text>
            <TextInput
              style={styles.input}
              placeholder="Téléphone"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(200)} style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleText}>
              <Text style={styles.sectionTitle}>Devenir conducteur</Text>
              <Text style={styles.sectionSubtitle}>
                {canBecomeDriver
                  ? 'Activez pour proposer vos trajets sur Zwanga.'
                  : 'Vous êtes déjà conducteur.'}
              </Text>
            </View>
            <Switch
              value={wantsToBeDriver}
              onValueChange={(value) => setWantsToBeDriver(value)}
              disabled={!canBecomeDriver}
              thumbColor={wantsToBeDriver ? Colors.primary : Colors.gray[300]}
              trackColor={{ false: Colors.gray[200], true: Colors.primary + '50' }}
            />
          </View>

          {wantsToBeDriver && (
            <View style={styles.driverCard}>
              <Text style={styles.driverCardText}>
                Ajoutez votre véhicule pour compléter votre profil conducteur.
              </Text>
              <TouchableOpacity
                style={styles.driverButton}
                onPress={() => router.push('/vehicle')}
              >
                <Ionicons name="car" size={16} color={Colors.primary} />
                <Text style={styles.driverButtonText}>Ajouter mon véhicule</Text>
              </TouchableOpacity>
            </View>
          )}
        </Animated.View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.saveButton, (isSaving || summaryLoading) && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isSaving || summaryLoading}
        >
          {isSaving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.saveButtonText}>Enregistrer</Text>
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={feedback.visible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View
              style={[
                styles.modalIconWrapper,
                feedback.success ? styles.modalIconSuccess : styles.modalIconError,
              ]}
            >
              <Ionicons
                name={feedback.success ? 'checkmark-circle' : 'close-circle'}
                size={32}
                color={Colors.white}
              />
            </View>
            <Text style={styles.modalTitle}>{feedback.success ? 'Succès' : 'Oops…'}</Text>
            <Text style={styles.modalMessage}>{feedback.message}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => {
                setFeedback((prev) => ({ ...prev, visible: false }));
                if (feedback.success) {
                  router.back();
                }
              }}
            >
              <Text style={styles.modalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  scrollContent: {
    paddingHorizontal: Spacing.xl,
    paddingBottom: Spacing.xxl,
    gap: Spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  headerTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
    gap: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  sectionSubtitle: {
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    marginTop: Spacing.xs,
  },
  photoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.lg,
    alignSelf: 'flex-start',
  },
  photoButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
  inputGroup: {
    gap: Spacing.xs,
  },
  inputLabel: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    fontSize: FontSizes.base,
    color: Colors.gray[900],
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  toggleText: {
    flex: 1,
  },
  driverCard: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary + '10',
  },
  driverCardText: {
    color: Colors.gray[700],
    marginBottom: Spacing.sm,
  },
  driverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  driverButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.lg,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[200],
    backgroundColor: Colors.white,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.base,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  modalCard: {
    width: '100%',
    borderRadius: BorderRadius.xl,
    backgroundColor: Colors.white,
    padding: Spacing.xl,
    alignItems: 'center',
    ...CommonStyles.shadowLg,
    gap: Spacing.md,
  },
  modalIconWrapper: {
    width: 56,
    height: 56,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalIconSuccess: {
    backgroundColor: Colors.success,
  },
  modalIconError: {
    backgroundColor: Colors.danger,
  },
  modalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  modalMessage: {
    textAlign: 'center',
    color: Colors.gray[600],
  },
  modalButton: {
    marginTop: Spacing.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  modalButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
});

