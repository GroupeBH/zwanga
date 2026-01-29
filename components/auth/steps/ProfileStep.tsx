import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Image, ScrollView } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Spacing } from '@/constants/styles';
import { authStyles as styles } from '../styles';
import { VehicleType, vehicleOptions } from '../types';

interface ProfileStepProps {
  firstName: string;
  lastName: string;
  profilePicture: string | null;
  role: 'driver' | 'passenger';
  vehicleType: VehicleType | null;
  vehicleBrand: string;
  vehicleModel: string;
  vehicleColor: string;
  vehiclePlate: string;
  onFirstNameChange: (name: string) => void;
  onLastNameChange: (name: string) => void;
  onSelectProfilePicture: () => void;
  onRoleChange: (role: 'driver' | 'passenger') => void;
  onVehicleTypeChange: (type: VehicleType) => void;
  onOpenVehicleModal: () => void;
  onContinue: () => void;
}

export function ProfileStep({
  firstName,
  lastName,
  profilePicture,
  role,
  vehicleType,
  vehicleBrand,
  vehicleModel,
  vehicleColor,
  vehiclePlate,
  onFirstNameChange,
  onLastNameChange,
  onSelectProfilePicture,
  onRoleChange,
  onVehicleTypeChange,
  onOpenVehicleModal,
  onContinue,
}: ProfileStepProps) {
  return (
    <Animated.View entering={FadeInDown.springify()} exiting={FadeOutUp} style={styles.stepContainer}>
      <View style={styles.heroSectionCompact}>
        <Text style={styles.heroTitle}>Créez votre profil</Text>
        <Text style={styles.heroSubtitle}>Dites-nous en plus sur vous</Text>
      </View>

      <View style={styles.profileHeader}>
        <TouchableOpacity style={styles.avatarUpload} onPress={onSelectProfilePicture}>
          {profilePicture ? (
            <Image source={{ uri: profilePicture }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="camera" size={32} color={Colors.primary} />
            </View>
          )}
          <View style={styles.editBadge}>
            <Ionicons name="pencil" size={14} color="white" />
          </View>
        </TouchableOpacity>
      </View>

      <View style={styles.formGrid}>
        <View style={styles.inputWrapper}>
          <Ionicons name="person-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Prénom"
            placeholderTextColor={Colors.gray[400]}
            value={firstName}
            onChangeText={onFirstNameChange}
          />
        </View>
        <View style={styles.inputWrapper}>
          <Ionicons name="person-outline" size={20} color={Colors.gray[500]} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Nom"
            placeholderTextColor={Colors.gray[400]}
            value={lastName}
            onChangeText={onLastNameChange}
          />
        </View>
      </View>

      <View style={styles.roleSelection}>
        <Text style={styles.sectionLabel}>Je suis principalement :</Text>
        <View style={styles.roleCards}>
          <TouchableOpacity
            style={[styles.roleCard, role === 'passenger' && styles.roleCardActive]}
            onPress={() => onRoleChange('passenger')}
          >
            <View style={styles.roleIconBadge}>
              <Ionicons
                name="person"
                size={24}
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
            <View style={styles.roleIconBadge}>
              <Ionicons
                name="car"
                size={24}
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
          <Text style={styles.sectionLabel}>Votre véhicule</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.vehicleTypesScroll}
          >
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
                  size={28}
                  color={vehicleType === opt.id ? Colors.primary : Colors.gray[400]}
                />
                <Text
                  style={[
                    styles.vehicleTypeLabel,
                    vehicleType === opt.id && styles.vehicleTypeLabelActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

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
        style={[styles.mainButton, styles.mainButtonActive, { marginTop: Spacing.xl, marginBottom: Spacing.xxl }]}
        onPress={onContinue}
      >
        <Text style={styles.mainButtonText}>Continuer</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

