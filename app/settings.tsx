import { useSettingsAccountActions } from '../hooks/settings/useSettingsAccountActions';
import { styles } from '../features/screen-styles/app/settings/index';
import { UpdateAnnouncementsChoice } from '@/components/UpdateAnnouncementsChoice';
import { TutorialOverlay } from '@/components/TutorialOverlay';
import { useDialog } from '@/components/ui/DialogProvider';
import { Colors, Spacing } from '@/constants/styles';
import { useTutorialGuide } from '@/contexts/TutorialContext';
import { useProfilePhoto } from '@/hooks/useProfilePhoto';
import { useDeleteAccountMutation } from '@/store/api/userApi';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { selectUser } from '@/store/selectors';
import { openDriverAlertSettings } from '@/services/driverAlertChannel';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInDown } from '@/utils/reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function SettingsScreen() {
  const router = useRouter();
  const user = useAppSelector(selectUser);
  const dispatch = useAppDispatch();
  const { showDialog, hideDialog } = useDialog();
  const [deleteAccount, { isLoading: isDeletingAccount }] = useDeleteAccountMutation();
  const { changeProfilePhoto } = useProfilePhoto();
  const { shouldShow: shouldShowSettingsGuide, complete: completeSettingsGuide } =
    useTutorialGuide('settings_screen');
  const [settingsGuideVisible, setSettingsGuideVisible] = useState(false);

  useEffect(() => {
    if (shouldShowSettingsGuide) {
      setSettingsGuideVisible(true);
    }
  }, [shouldShowSettingsGuide]);

  const dismissSettingsGuide = () => {
    setSettingsGuideVisible(false);
    completeSettingsGuide();
  };

  const openLocationSettings = () => {
    if (user?.role === 'driver') {
      router.push('/driver-availability');
      return;
    }
    void Linking.openSettings().catch(() => showDialog({
      variant: 'danger', title: 'Réglages indisponibles',
      message: 'Ouvrez les réglages de votre téléphone, puis les autorisations de localisation de Zwanga.',
    }));
  };

  const { accountItems, handleDeleteAccount } = useSettingsAccountActions({
    showDialog,
    deleteAccount,
    hideDialog,
    dispatch,
    router,
    changeProfilePhoto,
  });

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={Colors.gray[900]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Paramètres</Text>
        </View>
      </View>

      <ScrollView 
        style={styles.scrollView} 
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Compte */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.section}>
          <Text style={styles.sectionLabel}>COMPTE</Text>
          <View style={styles.card}>
            {accountItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.menuItem,
                  index !== accountItems.length - 1 && styles.menuItemBorder,
                ]}
                onPress={item.onPress || (() => item.route && router.push(item.route as any))}
              >
                <View style={styles.menuIcon}>
                  <Ionicons name={item.icon as any} size={20} color={Colors.gray[600]} />
                </View>
                <Text style={styles.menuText}>{item.label}</Text>
                {item.route && (
                  <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </Animated.View>

        {/* Notifications */}
        <UpdateAnnouncementsChoice />
        <Animated.View entering={FadeInDown.delay(100)} style={styles.section}>
          <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.menuItem} accessibilityRole="button"
              accessibilityLabel="Régler la sonnerie et les vibrations"
              onPress={() => { void openDriverAlertSettings().catch(() => showDialog({
                variant: 'danger', title: 'Réglages indisponibles',
                message: 'Ouvrez les réglages de votre téléphone, puis les notifications de Zwanga.',
              })); }}>
              <View style={[styles.menuIcon, styles.menuIconYellow]}>
                <Ionicons name="volume-high" size={20} color={Colors.secondary} />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuText}>Sonnerie et vibrations</Text>
                <Text style={styles.menuSubtext}>Commandes et réservations</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>

          </View>
        </Animated.View>

        {/* Confidentialité */}
        <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
          <Text style={styles.sectionLabel}>LOCALISATION</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.menuItem} accessibilityRole="button"
              accessibilityLabel="Gérer la localisation" onPress={openLocationSettings}>
              <View style={styles.menuIcon}>
                <Ionicons name="location" size={20} color={Colors.gray[600]} />
              </View>
              <View style={styles.menuTextContainer}>
                <Text style={styles.menuText}>Gérer la localisation</Text>
                <Text style={styles.menuSubtext}>{user?.role === 'driver'
                  ? 'Autorisations et réception des demandes'
                  : 'Autorisations du téléphone'}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Préférences */}
        <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
          <Text style={styles.sectionLabel}>PRÉFÉRENCES</Text>
          <View style={styles.card}>
            <View style={styles.menuItem}>
              <View style={styles.menuIcon}>
                <Ionicons name="language" size={20} color={Colors.gray[600]} />
              </View>
              <Text style={styles.menuText}>Langue</Text>
              <Text style={styles.menuValue}>Français</Text>
            </View>
          </View>
        </Animated.View>

        {/* Aide & Support */}
        <Animated.View entering={FadeInDown.delay(400)} style={styles.section}>
          <Text style={styles.sectionLabel}>AIDE & SUPPORT</Text>
          <TouchableOpacity
            style={styles.supportCard}
            onPress={() => router.push('/support')}
          >
            <View style={styles.supportIcon}>
              <Ionicons name="help-circle" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.menuText}>Centre d&apos;aide</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(500)} style={[styles.section, { marginBottom: Spacing.xxl }]}>
          <Text style={styles.sectionLabel}>ZONE DANGEREUSE</Text>
          <TouchableOpacity
            style={[styles.supportCard, isDeletingAccount && styles.disabledMenuItem]}
            onPress={handleDeleteAccount}
            disabled={isDeletingAccount}
          >
            <View style={[styles.supportIcon, styles.menuIconDanger]}>
              <Ionicons name="trash-outline" size={20} color={Colors.danger} />
            </View>
            <Text style={[styles.menuText, styles.dangerText]}>Supprimer mon compte</Text>
            {isDeletingAccount ? (
              <ActivityIndicator size="small" color={Colors.danger} />
            ) : (
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            )}
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>

      <TutorialOverlay
        visible={settingsGuideVisible}
        title="Personnalisez votre expérience"
        message="Gérez les autorisations du téléphone, vos annonces de mise à jour et les informations de votre compte."
        onDismiss={dismissSettingsGuide}
      />
    </SafeAreaView>
  );
}


