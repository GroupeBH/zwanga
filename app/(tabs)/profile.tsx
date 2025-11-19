import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { useProfilePhoto } from '@/hooks/useProfilePhoto';
import { useGetKycStatusQuery, useGetProfileSummaryQuery } from '@/store/api/userApi';
import { useCreateVehicleMutation, useGetVehiclesQuery } from '@/store/api/vehicleApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { logout } from '@/store/slices/authSlice';
import type { Vehicle } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function ProfileScreen() {
  const router = useRouter();
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectUser);
  const { changeProfilePhoto, isUploading } = useProfilePhoto();
  const [refreshing, setRefreshing] = useState(false);
  const [vehicleModalVisible, setVehicleModalVisible] = useState(false);
  const [vehicleBrand, setVehicleBrand] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [vehicleColor, setVehicleColor] = useState('');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const {
    data: profileSummary,
    isLoading: profileLoading,
    refetch: refetchProfile,
  } = useGetProfileSummaryQuery();
  const { data: kycStatus, isLoading: kycLoading } = useGetKycStatusQuery();
  const {
    data: vehicles,
    isLoading: vehiclesLoading,
    refetch: refetchVehicles,
  } = useGetVehiclesQuery();
  const [createVehicle, { isLoading: creatingVehicle }] = useCreateVehicleMutation();

  const currentUser = profileSummary?.user ?? user;
  const stats = profileSummary?.stats;
  const vehicleList: Vehicle[] = vehicles ?? [];

  const derivedStats = useMemo(
    () => [
      {
        label: 'Trajets publiés',
        value: stats?.tripsAsDriver ?? currentUser?.totalTrips ?? 0,
        color: Colors.primary,
      },
      {
        label: 'Réservations (passager)',
        value: stats?.bookingsAsPassenger ?? 0,
        color: Colors.secondary,
      },
      {
        label: 'Réservations (conducteur)',
        value: stats?.bookingsAsDriver ?? 0,
        color: Colors.info,
      },
      {
        label: 'Messages envoyés',
        value: stats?.messagesSent ?? 0,
        color: Colors.success,
      },
    ],
    [currentUser?.totalTrips, stats],
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchProfile(), refetchVehicles()]);
    } finally {
      setRefreshing(false);
    }
  };

  const resetVehicleForm = () => {
    setVehicleBrand('');
    setVehicleModel('');
    setVehicleColor('');
    setVehiclePlate('');
  };

  const handleAddVehicle = async () => {
    if (!vehicleBrand.trim() || !vehicleModel.trim() || !vehicleColor.trim() || !vehiclePlate.trim()) {
      Alert.alert('Champs requis', 'Merci de renseigner la marque, le modèle, la couleur et la plaque.');
      return;
    }

    try {
      await createVehicle({
        brand: vehicleBrand.trim(),
        model: vehicleModel.trim(),
        color: vehicleColor.trim(),
        licensePlate: vehiclePlate.trim(),
      }).unwrap();
      setVehicleModalVisible(false);
      resetVehicleForm();
      await Promise.all([refetchVehicles(), refetchProfile()]);
    } catch (error: any) {
      const message =
        error?.data?.message ?? error?.error ?? 'Impossible d’ajouter le véhicule pour le moment.';
      Alert.alert('Erreur', Array.isArray(message) ? message.join('\n') : message);
    }
  };

  const isKycApproved = kycStatus?.status === 'approved';
  const isKycPending = kycStatus?.status === 'pending';

  const badges = [
    ...(currentUser?.isDriver
      ? [{ icon: 'car', color: Colors.primary, label: 'Conducteur' }]
      : []),
    ...(isKycApproved
      ? [{ icon: 'shield-checkmark', color: Colors.success, label: 'KYC validé' }]
      : []),
  ];

  const menuItems = [
    { icon: 'person-outline', label: 'Modifier le profil', route: '/edit-profile' },
    { icon: 'bookmark-outline', label: 'Mes réservations', route: '/bookings' },
    { icon: 'notifications-outline', label: 'Notifications', route: '/notifications' },
    { icon: 'settings-outline', label: 'Paramètres', route: '/settings' },
    { icon: 'help-circle-outline', label: 'Aide & Support', route: '/support' },
  ];

  const handleLogout = () => {
    dispatch(logout());
    router.replace('/auth');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Text style={styles.headerTitle}>Mon Profil</Text>
            <TouchableOpacity
              style={styles.settingsButton}
              onPress={() => router.push('/settings')}
            >
              <Ionicons name="settings-outline" size={24} color={Colors.white} />
            </TouchableOpacity>
          </View>

          {/* Infos utilisateur */}
          <View style={styles.userInfo}>
            <TouchableOpacity 
              style={styles.avatarContainer}
              onPress={changeProfilePhoto}
              disabled={isUploading}
              activeOpacity={0.8}
            >
              {currentUser?.profilePicture || user?.avatar ? (
                <Image
                  source={{ uri: currentUser?.profilePicture ?? user?.avatar ?? undefined }}
                  style={styles.avatarImage}
                />
              ) : (
                <View style={styles.avatar}>
                  <Text style={styles.avatarEmoji}>👤</Text>
                </View>
              )}
              {isUploading ? (
                <View style={styles.uploadingOverlay}>
                  <ActivityIndicator size="small" color={Colors.white} />
                </View>
              ) : (
                <View style={styles.editBadge}>
                  <Ionicons name="camera" size={14} color={Colors.white} />
                </View>
              )}
              {currentUser?.identityVerified && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark" size={16} color={Colors.white} />
                </View>
              )}
            </TouchableOpacity>
            <Text style={styles.userName}>{currentUser?.name || 'Utilisateur'}</Text>
            <Text style={styles.userPhone}>{currentUser?.phone || ''}</Text>

            {/* Rating */}
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={20} color={Colors.secondary} />
              <Text style={styles.ratingText}>{(currentUser?.rating ?? 0).toFixed(1)}</Text>
              <Text style={styles.ratingSubtext}>{currentUser?.totalTrips ?? 0} trajets</Text>
            </View>
            {profileLoading && (
              <View style={styles.loadingRow}>
                <ActivityIndicator color={Colors.white} size="small" />
                <Text style={styles.loadingRowText}>Synchronisation du profil…</Text>
              </View>
            )}
          </View>
        </View>

        {/* Statistiques */}
        <View style={styles.statsContainer}>
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>Statistiques</Text>
            <View style={styles.statsGrid}>
              {derivedStats.map((stat, index) => (
                <View
                  key={stat.label}
                  style={[
                    styles.statItem,
                    index % 2 === 0 && styles.statItemBorderRight,
                    index < 2 && styles.statItemBorderBottom,
                  ]}
                >
                  <Text style={[styles.statValue, { color: stat.color }]}>{stat.value}</Text>
                  <Text style={styles.statLabel}>{stat.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* Badges */}
        {badges.length > 0 && (
          <View style={styles.badgesContainer}>
            <View style={styles.badgesCard}>
              <Text style={styles.badgesTitle}>Badges</Text>
              <View style={styles.badgesList}>
                {badges.map((badge, index) => (
                  <Animated.View
                    key={`${badge.label}-${index}`}
                    entering={FadeInDown.delay(index * 100)}
                    style={styles.badgeItem}
                  >
                    <View style={[styles.badgeIcon, { backgroundColor: badge.color + '20' }]}>
                      <Ionicons name={badge.icon as any} size={32} color={badge.color} />
                    </View>
                    <Text style={styles.badgeLabel}>{badge.label}</Text>
                  </Animated.View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* KYC */}
        <View style={styles.kycContainer}>
          <View style={styles.kycCard}>
            <View style={styles.kycHeader}>
              <View style={styles.kycHeaderLeft}>
                <Ionicons name="shield-checkmark" size={20} color={Colors.primary} />
                <Text style={styles.kycTitle}>Statut KYC</Text>
              </View>
              {kycLoading && <ActivityIndicator size="small" color={Colors.primary} />}
            </View>
            <Text
              style={[
                styles.kycStatusText,
                isKycApproved && styles.kycStatusApproved,
                isKycPending && styles.kycStatusPending,
              ]}
            >
              {isKycApproved
                ? 'Vérifié'
                : isKycPending
                ? 'En cours de vérification'
                : 'Non vérifié'}
            </Text>
            {!isKycApproved && (
              <TouchableOpacity
                style={styles.kycButton}
                onPress={() =>
                  Alert.alert(
                    'KYC',
                    'La soumission des documents sera bientôt disponible dans l’application.',
                  )
                }
              >
                <Text style={styles.kycButtonText}>
                  {isKycPending ? 'Modifier mes documents' : 'Soumettre mes documents'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={Colors.primary} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.vehiclesContainer}>
          <View style={styles.vehiclesHeader}>
            <Text style={styles.sectionTitle}>Mes véhicules</Text>
            <TouchableOpacity
              style={styles.vehicleAddButton}
              onPress={() => {
                resetVehicleForm();
                setVehicleModalVisible(true);
              }}
            >
              <Ionicons name="add" size={18} color={Colors.white} />
            </TouchableOpacity>
          </View>
          {vehiclesLoading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : vehicleList.length > 0 ? (
            vehicleList.map((vehicle) => (
              <View key={vehicle.id} style={styles.vehicleItem}>
                <View>
                  <Text style={styles.vehicleTitle}>
                    {vehicle.brand} {vehicle.model}
                  </Text>
                  <Text style={styles.vehiclePlate}>{vehicle.licensePlate}</Text>
                  <Text style={styles.vehicleColor}>{vehicle.color}</Text>
                </View>
                <View
                  style={[
                    styles.vehicleStatus,
                    { backgroundColor: vehicle.isActive ? Colors.success + '20' : Colors.gray[200] },
                  ]}
                >
                  <Text
                    style={[
                      styles.vehicleStatusText,
                      { color: vehicle.isActive ? Colors.success : Colors.gray[600] },
                    ]}
                  >
                    {vehicle.isActive ? 'Actif' : 'Inactif'}
                  </Text>
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.vehicleEmptyText}>
              Aucun véhicule enregistré. Ajoutez-en un pour devenir conducteur.
            </Text>
          )}
        </View>

        {/* Menu */}
        <View style={styles.menuContainer}>
          <View style={styles.menuCard}>
            {menuItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.menuItem,
                  index !== menuItems.length - 1 && styles.menuItemBorder,
                ]}
                onPress={() => router.push(item.route as any)}
              >
                <View style={styles.menuIcon}>
                  <Ionicons name={item.icon as any} size={20} color={Colors.gray[600]} />
                </View>
                <Text style={styles.menuText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Bouton déconnexion */}
        <View style={styles.logoutContainer}>
          <TouchableOpacity
            style={styles.logoutButton}
            onPress={handleLogout}
          >
            <View style={styles.logoutButtonContent}>
              <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
              <Text style={styles.logoutText}>Déconnexion</Text>
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal visible={vehicleModalVisible} transparent animationType="fade">
        <View style={styles.vehicleModalOverlay}>
          <View style={styles.vehicleModalCard}>
            <View style={styles.vehicleModalHeader}>
              <Text style={styles.vehicleModalTitle}>Ajouter un véhicule</Text>
              <TouchableOpacity onPress={() => setVehicleModalVisible(false)}>
                <Ionicons name="close" size={22} color={Colors.gray[600]} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.vehicleModalContent}>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Marque</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="Toyota"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleBrand}
                  onChangeText={setVehicleBrand}
                />
              </View>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Modèle</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="Corolla"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleModel}
                  onChangeText={setVehicleModel}
                />
              </View>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Couleur</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="Bleu"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehicleColor}
                  onChangeText={setVehicleColor}
                />
              </View>
              <View style={styles.vehicleInputGroup}>
                <Text style={styles.vehicleInputLabel}>Plaque d'immatriculation</Text>
                <TextInput
                  style={styles.vehicleInput}
                  placeholder="ABC-1234"
                  placeholderTextColor={Colors.gray[400]}
                  value={vehiclePlate}
                  onChangeText={setVehiclePlate}
                />
              </View>
              <TouchableOpacity
                style={[styles.vehicleSaveButton, creatingVehicle && styles.vehicleSaveButtonDisabled]}
                onPress={handleAddVehicle}
                disabled={creatingVehicle}
              >
                {creatingVehicle ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.vehicleSaveButtonText}>Ajouter</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
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
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xxl,
    borderBottomLeftRadius: BorderRadius.xxl,
    borderBottomRightRadius: BorderRadius.xxl,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.xl,
  },
  headerTitle: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  settingsButton: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfo: {
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: Spacing.lg,
  },
  avatar: {
    width: 96,
    height: 96,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 96,
    height: 96,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.gray[200],
  },
  avatarEmoji: {
    fontSize: 48,
  },
  editBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.full,
    borderWidth: 3,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...CommonStyles.shadowSm,
  },
  uploadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifiedBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    backgroundColor: Colors.success,
    borderRadius: BorderRadius.full,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    color: Colors.white,
    marginBottom: Spacing.xs,
  },
  userPhone: {
    color: Colors.white,
    opacity: 0.8,
    marginBottom: Spacing.lg,
    fontSize: FontSizes.base,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  ratingText: {
    color: Colors.white,
    fontWeight: FontWeights.bold,
    fontSize: FontSizes.lg,
    marginLeft: Spacing.sm,
  },
  ratingSubtext: {
    color: Colors.white,
    opacity: 0.8,
    marginLeft: Spacing.xs,
    fontSize: FontSizes.base,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.sm,
    gap: Spacing.sm,
  },
  loadingRowText: {
    color: Colors.white,
    opacity: 0.85,
  },
  statsContainer: {
    paddingHorizontal: Spacing.xl,
    marginTop: -Spacing.xl,
    marginBottom: Spacing.xl,
  },
  statsCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  statsTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.md,
    fontSize: FontSizes.base,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statItem: {
    width: '50%',
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  statItemBorderRight: {
    borderRightWidth: 1,
    borderRightColor: Colors.gray[100],
  },
  statItemBorderBottom: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  statValue: {
    fontSize: FontSizes.xxl,
    fontWeight: FontWeights.bold,
    marginBottom: Spacing.xs,
  },
  statLabel: {
    fontSize: FontSizes.sm,
    color: Colors.gray[600],
  },
  badgesContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  badgesCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  badgesTitle: {
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.md,
    fontSize: FontSizes.base,
  },
  sectionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  badgesList: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  badgeItem: {
    alignItems: 'center',
  },
  badgeIcon: {
    width: 64,
    height: 64,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  badgeLabel: {
    fontSize: FontSizes.xs,
    color: Colors.gray[600],
    textAlign: 'center',
  },
  kycContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  kycCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...CommonStyles.shadowSm,
  },
  kycHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  kycHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  kycTitle: {
    fontWeight: FontWeights.semibold,
    color: Colors.gray[800],
  },
  kycStatusText: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
    marginBottom: Spacing.sm,
  },
  kycStatusApproved: {
    color: Colors.success,
  },
  kycStatusPending: {
    color: Colors.secondary,
  },
  kycButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  kycButtonText: {
    color: Colors.primary,
    fontWeight: FontWeights.semibold,
  },
  vehiclesContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  vehiclesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  vehicleAddButton: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.lg,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    marginBottom: Spacing.sm,
    ...CommonStyles.shadowSm,
  },
  vehicleTitle: {
    fontWeight: FontWeights.semibold,
    color: Colors.gray[900],
  },
  vehiclePlate: {
    color: Colors.gray[600],
    marginTop: Spacing.xs,
  },
  vehicleColor: {
    color: Colors.gray[500],
    fontSize: FontSizes.sm,
  },
  vehicleStatus: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
  },
  vehicleStatusText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  vehicleEmptyText: {
    textAlign: 'center',
    color: Colors.gray[600],
    marginTop: Spacing.sm,
  },
  vehicleModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  vehicleModalCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
  },
  vehicleModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  vehicleModalTitle: {
    fontSize: FontSizes.lg,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  vehicleModalContent: {
    gap: Spacing.md,
  },
  vehicleInputGroup: {
    gap: Spacing.xs,
  },
  vehicleInputLabel: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  vehicleInput: {
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    color: Colors.gray[900],
  },
  vehicleSaveButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  vehicleSaveButtonDisabled: {
    opacity: 0.6,
  },
  vehicleSaveButtonText: {
    color: Colors.white,
    fontWeight: FontWeights.semibold,
  },
  menuContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xl,
  },
  menuCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    ...CommonStyles.shadowSm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  menuIcon: {
    width: 40,
    height: 40,
    backgroundColor: Colors.gray[100],
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
  menuText: {
    flex: 1,
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
    fontSize: FontSizes.base,
  },
  logoutContainer: {
    paddingHorizontal: Spacing.xl,
    marginBottom: Spacing.xxl,
  },
  logoutButton: {
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    paddingVertical: Spacing.lg,
    borderRadius: BorderRadius.xl,
    alignItems: 'center',
  },
  logoutButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoutText: {
    color: Colors.danger,
    fontWeight: FontWeights.bold,
    marginLeft: Spacing.sm,
    fontSize: FontSizes.base,
  },
});
