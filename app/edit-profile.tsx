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
      // Utiliser role pour déterminer si l'utilisateur est conducteur
      const isDriver = user?.role === 'driver' || user?.role === 'both';
      setWantsToBeDriver(isDriver);
    }
  }, [user]);

  // L'utilisateur peut devenir conducteur s'il n'est pas déjà driver ou both
  const canBecomeDriver = useMemo(() => {
    const role = user?.role;
    return role !== 'driver' && role !== 'both';
  }, [user?.role]);
  
  // L'utilisateur est actuellement conducteur si son role est driver ou both
  const isCurrentlyDriver = useMemo(() => {
    const role = user?.role;
    return role === 'driver' || role === 'both';
  }, [user?.role]);

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
      const formData = new FormData();
      formData.append('firstName', firstName.trim());
      formData.append('lastName', lastName.trim());
      formData.append('phone', phone.trim());
      // Ne modifier le rôle que si l'utilisateur n'est pas déjà conducteur
      // et qu'il souhaite devenir conducteur
      if (canBecomeDriver && wantsToBeDriver) {
        formData.append('role', 'driver');
      } else if (canBecomeDriver && !wantsToBeDriver) {
        // Si l'utilisateur ne veut plus être conducteur (mais n'est pas encore actif)
        formData.append('role', 'passenger');
      }
      // Si l'utilisateur est déjà conducteur (role === 'driver' ou 'both'), on ne modifie pas le rôle
      const updated = await updateUserMutation(formData).unwrap();
      dispatch(
        updateUserAction({
          id: updated.id,
          name: `${updated.firstName ?? ''} ${updated.lastName ?? ''}`.trim() || updated.name,
          firstName: updated.firstName,
          lastName: updated.lastName,
          phone: updated.phone,
          avatar: updated.profilePicture ?? updated.avatar,
          profilePicture: updated.profilePicture,
          role: updated.role,
          isDriver: updated.isDriver,
        }),
      );
      await refetch();
      const successMessage = wantsToBeDriver && canBecomeDriver
        ? 'Profil mis à jour. N\'oubliez pas d\'ajouter un véhicule et de compléter la vérification KYC pour devenir conducteur.'
        : 'Profil mis à jour avec succès.';
      setFeedback({
        visible: true,
        success: true,
        message: successMessage,
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
              <View style={styles.titleRow}>
                <Text style={styles.sectionTitle}>Devenir conducteur</Text>
                {isCurrentlyDriver && (
                  <View style={styles.driverBadge}>
                    <Ionicons name="checkmark-circle" size={14} color={Colors.success} />
                    <Text style={styles.badgeText}>Actif</Text>
                  </View>
                )}
              </View>
              <Text style={styles.sectionSubtitle}>
                {isCurrentlyDriver
                  ? 'Vous êtes conducteur. Vous pouvez proposer des trajets sur Zwanga.'
                  : canBecomeDriver
                    ? 'Activez pour proposer vos trajets sur Zwanga. Vous devrez ajouter un véhicule et compléter la vérification KYC.'
                    : 'Vous êtes déjà conducteur.'}
              </Text>
            </View>
            <Switch
              value={isCurrentlyDriver || wantsToBeDriver}
              onValueChange={(value) => {
                if (!isCurrentlyDriver) {
                  setWantsToBeDriver(value);
                }
              }}
              disabled={isCurrentlyDriver}
              thumbColor={isCurrentlyDriver || wantsToBeDriver ? Colors.primary : Colors.gray[300]}
              trackColor={{ false: Colors.gray[200], true: Colors.primary + '50' }}
            />
          </View>

          {isCurrentlyDriver && (
            <View style={[styles.driverCard, styles.driverCardActive]}>
              <View style={styles.driverCardHeader}>
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                <Text style={styles.driverCardTitle}>Profil conducteur actif</Text>
              </View>
              <Text style={styles.driverCardText}>
                Vous pouvez publier des trajets et recevoir des réservations. Gérez votre véhicule depuis votre profil.
              </Text>
              <TouchableOpacity
                style={styles.driverButton}
                onPress={() => router.push('/profile')}
              >
                <Ionicons name="car" size={16} color={Colors.primary} />
                <Text style={styles.driverButtonText}>Voir mon profil</Text>
              </TouchableOpacity>
            </View>
          )}

          {!isCurrentlyDriver && wantsToBeDriver && (
            <View style={styles.driverCard}>
              <View style={styles.driverCardHeader}>
                <Ionicons name="information-circle" size={20} color={Colors.warning} />
                <Text style={styles.driverCardTitle}>Étapes pour devenir conducteur</Text>
              </View>
              <View style={styles.stepsList}>
                <View style={styles.stepItem}>
                  <Ionicons name="car-outline" size={16} color={Colors.primary} />
                  <Text style={styles.stepText}>Ajouter un véhicule</Text>
                </View>
                <View style={styles.stepItem}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={Colors.primary} />
                  <Text style={styles.stepText}>Compléter la vérification KYC</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.driverButton}
                onPress={() => router.push('/profile')}
              >
                <Ionicons name="car" size={16} color={Colors.primary} />
                <Text style={styles.driverButtonText}>Commencer maintenant</Text>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  driverBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.success + '15',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
  },
  badgeText: {
    fontSize: FontSizes.xs,
    color: Colors.success,
    fontWeight: FontWeights.semibold,
  },
  driverCard: {
    marginTop: Spacing.md,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.primary + '10',
  },
  driverCardActive: {
    backgroundColor: Colors.success + '10',
    borderWidth: 1,
    borderColor: Colors.success + '30',
  },
  driverCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  driverCardTitle: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  driverCardText: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    marginBottom: Spacing.sm,
    lineHeight: 18,
  },
  stepsList: {
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepText: {
    fontSize: FontSizes.sm,
    color: Colors.gray[700],
  },
  driverButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    alignSelf: 'flex-start',
    marginTop: Spacing.xs,
  },
  driverButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
    fontSize: FontSizes.sm,
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

