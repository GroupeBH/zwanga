import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Image } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from '@/utils/reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { GenderSelector } from '@/components/GenderSelector';
import type { UserGender } from '@/types';
import { authStyles as styles } from '../styles';
import { VehicleType, vehicleOptions } from '../types';

const SIGNUP_GENDERS = ['male', 'female'] as const satisfies readonly UserGender[];

interface ProfileStepProps {
  firstName: string;
  lastName: string;
  showNameFields?: boolean;
  profilePicture: string | null;
  gender: UserGender | null;
  referralCode: string;
  role: 'driver' | 'passenger';
  vehicleType: VehicleType | null;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehiclePlate: string;
  onFirstNameChange: (name: string) => void;
  onLastNameChange: (name: string) => void;
  onSelectProfilePicture: () => void;
  onGenderChange: (gender: UserGender) => void;
  onReferralCodeChange: (code: string) => void;
  onRoleChange: (role: 'driver' | 'passenger') => void;
  onVehicleTypeChange: (type: VehicleType) => void;
  onOpenVehicleModal: () => void;
  onContinue: () => void;
}

export function ProfileStep({
  firstName,
  lastName,
  showNameFields = true,
  profilePicture,
  gender,
  referralCode,
  role,
  vehicleType,
  vehicleBrand,
  vehicleModel,
  vehicleColor,
  vehiclePlate,
  onFirstNameChange,
  onLastNameChange,
  onSelectProfilePicture,
  onGenderChange,
  onReferralCodeChange,
  onRoleChange,
  onVehicleTypeChange,
  onOpenVehicleModal,
  onContinue,
}: ProfileStepProps) {
  return (
    <Animated.View
      entering={FadeInDown.springify()}
      exiting={FadeOutUp}
      style={[styles.stepContainer, styles.profileStepContainer]}
    >
      <View style={styles.profileCompactHeader}>
        <View style={styles.profileCompactHeading}>
          <Text style={styles.profileCompactEyebrow}>DERNIÈRE ÉTAPE</Text>
          <Text style={styles.profileCompactTitle}>Votre profil</Text>
        </View>
        <TouchableOpacity style={styles.avatarUpload} onPress={onSelectProfilePicture}>
          {profilePicture ? (
            <Image source={{ uri: profilePicture }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="camera" size={22} color={Colors.primary} />
            </View>
          )}
          <View style={styles.editBadge}>
            <Ionicons name="pencil" size={11} color="white" />
          </View>
        </TouchableOpacity>
      </View>

      {showNameFields && (
        <View style={styles.profileNameRow}>
          <View style={[styles.inputWrapper, styles.profileInputWrapper]}>
            <Ionicons name="person-outline" size={17} color={Colors.gray[500]} style={styles.profileInputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Prénom"
              placeholderTextColor={Colors.gray[400]}
              value={firstName}
              onChangeText={onFirstNameChange}
            />
          </View>
          <View style={[styles.inputWrapper, styles.profileInputWrapper]}>
            <Ionicons name="person-outline" size={17} color={Colors.gray[500]} style={styles.profileInputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Nom"
              placeholderTextColor={Colors.gray[400]}
              value={lastName}
              onChangeText={onLastNameChange}
            />
          </View>
        </View>
      )}

      <View style={styles.genderSelection}>
        <GenderSelector
          compact
          label="Sexe"
          value={gender}
          onChange={onGenderChange}
          allowedGenders={SIGNUP_GENDERS}
        />
      </View>

      <View style={styles.referralFieldBlock}>
        <Text style={styles.profileSectionLabel}>Code de parrainage (optionnel)</Text>
        <View style={[styles.inputWrapper, styles.referralInputWrapper]}>
          <Ionicons name="gift-outline" size={18} color={Colors.primary} style={styles.profileInputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Ex. ZW7K9M2P4Q"
            placeholderTextColor={Colors.gray[400]}
            value={referralCode}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={16}
            onChangeText={(value) => onReferralCodeChange(value.replace(/[^a-z0-9]/gi, '').toUpperCase())}
          />
        </View>
        <Text style={styles.referralHint}>Le code est lie une seule fois, a la creation du compte.</Text>
      </View>

      <View style={styles.roleSelection}>
        <Text style={styles.profileSectionLabel}>Statut</Text>
        <View style={styles.roleCards}>
          <TouchableOpacity
            style={[styles.roleCard, role === 'passenger' && styles.roleCardActive]}
            onPress={() => onRoleChange('passenger')}
          >
            <View style={[styles.roleIconBadge, role === 'passenger' && styles.roleIconBadgeActive]}>
              <Ionicons
                name="person"
                size={17}
                color={role === 'passenger' ? 'white' : Colors.gray[500]}
              />
            </View>
            <Text style={[styles.roleLabel, role === 'passenger' && styles.roleLabelActive]}>
              Passager
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.roleCard, role === 'driver' && styles.roleCardActive]}
            onPress={() => onRoleChange('driver')}
          >
            <View style={[styles.roleIconBadge, role === 'driver' && styles.roleIconBadgeActive]}>
              <Ionicons
                name="car"
                size={17}
                color={role === 'driver' ? 'white' : Colors.gray[500]}
              />
            </View>
            <Text style={[styles.roleLabel, role === 'driver' && styles.roleLabelActive]}>
              Conducteur
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {role === 'driver' && (
        <Animated.View entering={FadeInDown} style={styles.vehicleSection}>
          <Text style={styles.profileSectionLabel}>Votre véhicule</Text>
          <View style={styles.vehicleTypesScroll}>
            {vehicleOptions.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.vehicleTypeCard,
                  vehicleType === opt.id && styles.vehicleTypeCardActive,
                ]}
                onPress={() => onVehicleTypeChange(opt.id)}
              >
                <Ionicons
                  name={opt.icon}
                  size={20}
                  color={vehicleType === opt.id ? Colors.primary : Colors.gray[400]}
                />
                <Text
                  adjustsFontSizeToFit
                  numberOfLines={1}
                  style={[
                    styles.vehicleTypeLabel,
                    vehicleType === opt.id && styles.vehicleTypeLabelActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity style={styles.vehicleDetailsSheet} onPress={onOpenVehicleModal}>
            <View style={styles.vehicleDetailsInfo}>
              <Text style={styles.vehicleDetailsTitle}>
                {vehicleBrand ? `${vehicleBrand} ${vehicleModel}` : 'Informations du véhicule'}
              </Text>
              <Text style={styles.vehicleDetailsSubtitle}>
                {vehiclePlate ? `${vehicleColor} • ${vehiclePlate}` : 'Appuyez pour compléter'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={24} color={Colors.gray[400]} />
          </TouchableOpacity>
        </Animated.View>
      )}

      <TouchableOpacity
        style={[styles.mainButton, styles.mainButtonActive, styles.profileContinueButton]}
        onPress={onContinue}
      >
        <Text style={styles.mainButtonText}>Continuer</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}
