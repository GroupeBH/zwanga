import { styles } from '../features/screen-styles/app/edit-profile/index';
import { Colors } from '@/constants/styles';
import { GenderSelector } from '@/components/GenderSelector';
import { useProfilePhoto } from '@/hooks/useProfilePhoto';
import { useGetKycStatusQuery, useGetProfileSummaryQuery, useUpdateUserMutation } from '@/store/api/userApi';
import { useAppDispatch } from '@/store/hooks';
import { updateUser as updateUserAction } from '@/store/slices/authSlice';
import type { UserGender } from '@/types';
import { getApiErrorMessage } from '@/utils/errorHelpers';
import { normalizeLegalName } from '@/utils/legalIdentity';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { isDriverAccount } from '@/utils/accountRole';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function EditProfileScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const { data: profileSummary, isLoading: summaryLoading, refetch } = useGetProfileSummaryQuery();
  const { data: kycStatus } = useGetKycStatusQuery();
  const [updateUserMutation, { isLoading: isSaving }] = useUpdateUserMutation();
  const { changeProfilePhoto, isUploading } = useProfilePhoto();

  const user = profileSummary?.user;
  const isLegalIdentityLocked = kycStatus?.status === 'approved';

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<UserGender | null>(null);
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
      setGender(user.gender ?? null);
    }
  }, [user]);

  const isCurrentlyDriver = isDriverAccount(user);

  const handleSave = async () => {
    const legalFirstName = normalizeLegalName(firstName);
    const legalLastName = normalizeLegalName(lastName);

    if (!legalFirstName || !legalLastName) {
      setFeedback({
        visible: true,
        success: false,
        message: 'Merci de renseigner votre prénom et votre nom.',
      });
      return;
    }
    try {
      const formData = new FormData();
      if (!isLegalIdentityLocked) {
        formData.append('firstName', legalFirstName);
        formData.append('lastName', legalLastName);
      }
      formData.append('phone', phone.trim());
      if (gender) formData.append('gender', gender);
      // Editing personal information never requests or changes a driver role.
      const updated = await updateUserMutation(formData).unwrap();
      dispatch(
        updateUserAction({
          id: updated.id,
          name: `${updated.firstName ?? ''} ${updated.lastName ?? ''}`.trim() || updated.name,
          firstName: updated.firstName,
          lastName: updated.lastName,
          phone: updated.phone,
          gender: updated.gender,
          avatar: updated.profilePicture ?? updated.avatar,
          profilePicture: updated.profilePicture,
          updatedAt: updated.updatedAt,
        }),
      );
      void refetch();
      setFeedback({
        visible: true,
        success: true,
        message: 'Profil mis à jour avec succès.',
      });
    } catch (error: any) {
      setFeedback({
        visible: true,
        success: false,
        message: getApiErrorMessage(error, 'Impossible de sauvegarder les informations.'),
      });
    }
  };

  const handleChangePhoto = async () => {
    await changeProfilePhoto();
    void refetch();
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
          <View style={styles.legalIdentityNotice}>
            <Ionicons
              name={isLegalIdentityLocked ? 'lock-closed-outline' : 'id-card-outline'}
              size={19}
              color={isLegalIdentityLocked ? Colors.success : Colors.primary}
            />
            <Text style={styles.legalIdentityNoticeText}>
              {isLegalIdentityLocked
                ? 'Vos noms sont protégés après la vérification de votre identité. Contactez le support pour signaler un changement légal.'
                : 'Saisissez vos prénom(s) et votre nom comme sur votre pièce d’identité. Le post-nom est facultatif.'}
            </Text>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Prénom(s)</Text>
            <TextInput
              style={[styles.input, isLegalIdentityLocked && styles.inputLocked]}
              placeholder="Prénom(s)"
              placeholderTextColor={Colors.gray[400]}
              value={firstName}
              onChangeText={setFirstName}
              autoCapitalize="words"
              editable={!isLegalIdentityLocked}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nom</Text>
            <TextInput
              style={[styles.input, isLegalIdentityLocked && styles.inputLocked]}
              placeholder="Nom (post-nom facultatif)"
              placeholderTextColor={Colors.gray[400]}
              value={lastName}
              onChangeText={setLastName}
              autoCapitalize="words"
              editable={!isLegalIdentityLocked}
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
          <GenderSelector value={gender} onChange={setGender} />
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
                  : 'Vérifiez votre identité puis ajoutez un véhicule dans le parcours conducteur. Modifier ce profil ne change pas votre statut.'}
              </Text>
            </View>
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

          {!isCurrentlyDriver && (
            <View style={styles.driverCard}>
              <View style={styles.driverCardHeader}>
                <Ionicons name="information-circle" size={20} color={Colors.warning} />
                <Text style={styles.driverCardTitle}>Étapes pour devenir conducteur</Text>
              </View>
              <View style={styles.stepsList}>
                <View style={styles.stepItem}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={Colors.primary} />
                  <Text style={styles.stepText}>Vérifier mon identité</Text>
                </View>
                <View style={styles.stepItem}>
                  <Ionicons name="car-outline" size={16} color={Colors.primary} />
                  <Text style={styles.stepText}>Ajouter un véhicule</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.driverButton}
                onPress={() => router.push({ pathname: '/(tabs)/profile', params: { openDriverOnboarding: '1' } })}
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
