import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Switch, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Colors, Spacing, BorderRadius, FontSizes, FontWeights, CommonStyles } from '@/constants/styles';

export default function SettingsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState({
    tripUpdates: true,
    messages: true,
    sounds: false,
    promotions: true,
  });

  const [privacy, setPrivacy] = useState({
    shareLocation: true,
    showPhone: false,
    showRatings: true,
  });

  const [preferences, setPreferences] = useState({
    darkMode: false,
    autoAccept: false,
  });

  const accountItems = [
    { icon: 'person-outline', label: 'Modifier le profil', route: '/edit-profile' },
    { icon: 'lock-closed-outline', label: 'Sécurité', route: '/security' },
    { icon: 'card-outline', label: 'Abonnement', route: '/subscription' },
  ];

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

      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Compte */}
        <Animated.View entering={FadeInDown.delay(0)} style={styles.section}>
          <Text style={styles.sectionLabel}>COMPTE</Text>
          <View style={styles.card}>
            {accountItems.map((item, index) => (
              <TouchableOpacity
                key={index}
                style={[
                  styles.menuItem,
                  index !== accountItems.length - 1 && styles.menuItemBorder,
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
        </Animated.View>

        {/* Notifications */}
        <Animated.View entering={FadeInDown.delay(100)} style={styles.section}>
          <Text style={styles.sectionLabel}>NOTIFICATIONS</Text>
          <View style={styles.card}>
            <View style={[styles.menuItem, styles.menuItemBorder]}>
              <View style={[styles.menuIcon, styles.menuIconBlue]}>
                <Ionicons name="car" size={20} color={Colors.info} />
              </View>
              <Text style={styles.menuText}>Mises à jour de trajets</Text>
              <Switch
                value={notifications.tripUpdates}
                onValueChange={(value) => setNotifications({ ...notifications, tripUpdates: value })}
                trackColor={{ false: Colors.gray[200], true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>

            <View style={[styles.menuItem, styles.menuItemBorder]}>
              <View style={[styles.menuIcon, styles.menuIconGreen]}>
                <Ionicons name="chatbubbles" size={20} color={Colors.success} />
              </View>
              <Text style={styles.menuText}>Messages</Text>
              <Switch
                value={notifications.messages}
                onValueChange={(value) => setNotifications({ ...notifications, messages: value })}
                trackColor={{ false: Colors.gray[200], true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>

            <View style={[styles.menuItem, styles.menuItemBorder]}>
              <View style={[styles.menuIcon, styles.menuIconYellow]}>
                <Ionicons name="volume-high" size={20} color={Colors.secondary} />
              </View>
              <Text style={styles.menuText}>Sons</Text>
              <Switch
                value={notifications.sounds}
                onValueChange={(value) => setNotifications({ ...notifications, sounds: value })}
                trackColor={{ false: Colors.gray[200], true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>

            <View style={styles.menuItem}>
              <View style={[styles.menuIcon, styles.menuIconOrange]}>
                <Ionicons name="gift" size={20} color={Colors.primary} />
              </View>
              <Text style={styles.menuText}>Promotions</Text>
              <Switch
                value={notifications.promotions}
                onValueChange={(value) => setNotifications({ ...notifications, promotions: value })}
                trackColor={{ false: Colors.gray[200], true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>
          </View>
        </Animated.View>

        {/* Confidentialité */}
        <Animated.View entering={FadeInDown.delay(200)} style={styles.section}>
          <Text style={styles.sectionLabel}>CONFIDENTIALITÉ</Text>
          <View style={styles.card}>
            <View style={[styles.menuItem, styles.menuItemBorder]}>
              <View style={styles.menuIcon}>
                <Ionicons name="location" size={20} color={Colors.gray[600]} />
              </View>
              <Text style={styles.menuText}>Partager ma position</Text>
              <Switch
                value={privacy.shareLocation}
                onValueChange={(value) => setPrivacy({ ...privacy, shareLocation: value })}
                trackColor={{ false: Colors.gray[200], true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>

            <View style={[styles.menuItem, styles.menuItemBorder]}>
              <View style={styles.menuIcon}>
                <Ionicons name="call" size={20} color={Colors.gray[600]} />
              </View>
              <Text style={styles.menuText}>Afficher mon numéro</Text>
              <Switch
                value={privacy.showPhone}
                onValueChange={(value) => setPrivacy({ ...privacy, showPhone: value })}
                trackColor={{ false: Colors.gray[200], true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>

            <View style={styles.menuItem}>
              <View style={styles.menuIcon}>
                <Ionicons name="star" size={20} color={Colors.gray[600]} />
              </View>
              <Text style={styles.menuText}>Afficher mes évaluations</Text>
              <Switch
                value={privacy.showRatings}
                onValueChange={(value) => setPrivacy({ ...privacy, showRatings: value })}
                trackColor={{ false: Colors.gray[200], true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>
          </View>
        </Animated.View>

        {/* Préférences */}
        <Animated.View entering={FadeInDown.delay(300)} style={styles.section}>
          <Text style={styles.sectionLabel}>PRÉFÉRENCES</Text>
          <View style={styles.card}>
            <View style={[styles.menuItem, styles.menuItemBorder]}>
              <View style={styles.menuIcon}>
                <Ionicons name="moon" size={20} color={Colors.gray[600]} />
              </View>
              <Text style={styles.menuText}>Mode sombre</Text>
              <Switch
                value={preferences.darkMode}
                onValueChange={(value) => setPreferences({ ...preferences, darkMode: value })}
                trackColor={{ false: Colors.gray[200], true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>

            <TouchableOpacity style={[styles.menuItem, styles.menuItemBorder]}>
              <View style={styles.menuIcon}>
                <Ionicons name="language" size={20} color={Colors.gray[600]} />
              </View>
              <Text style={styles.menuText}>Langue</Text>
              <Text style={styles.menuValue}>Français</Text>
              <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>

            <View style={styles.menuItem}>
              <View style={styles.menuIcon}>
                <Ionicons name="checkmark-done" size={20} color={Colors.gray[600]} />
              </View>
              <Text style={styles.menuText}>Acceptation automatique</Text>
              <Switch
                value={preferences.autoAccept}
                onValueChange={(value) => setPreferences({ ...preferences, autoAccept: value })}
                trackColor={{ false: Colors.gray[200], true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>
          </View>
        </Animated.View>

        {/* Aide & Support */}
        <Animated.View entering={FadeInDown.delay(400)} style={[styles.section, { marginBottom: Spacing.xxl }]}>
          <Text style={styles.sectionLabel}>AIDE & SUPPORT</Text>
          <TouchableOpacity
            style={styles.supportCard}
            onPress={() => router.push('/support')}
          >
            <View style={styles.supportIcon}>
              <Ionicons name="help-circle" size={20} color={Colors.primary} />
            </View>
            <Text style={styles.menuText}>Centre d'aide</Text>
            <Ionicons name="chevron-forward" size={20} color={Colors.gray[400]} />
          </TouchableOpacity>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.gray[50],
  },
  header: {
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[200],
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: Spacing.lg,
  },
  headerTitle: {
    fontSize: FontSizes.xl,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  scrollView: {
    flex: 1,
  },
  section: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.xl,
  },
  sectionLabel: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.gray[500],
    marginBottom: Spacing.md,
  },
  card: {
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
  menuIconBlue: {
    backgroundColor: 'rgba(52, 152, 219, 0.1)',
  },
  menuIconGreen: {
    backgroundColor: 'rgba(46, 204, 113, 0.1)',
  },
  menuIconYellow: {
    backgroundColor: 'rgba(247, 184, 1, 0.1)',
  },
  menuIconOrange: {
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
  },
  menuText: {
    flex: 1,
    color: Colors.gray[800],
    fontWeight: FontWeights.medium,
    fontSize: FontSizes.base,
  },
  menuValue: {
    color: Colors.gray[600],
    marginRight: Spacing.sm,
    fontSize: FontSizes.base,
  },
  supportCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    ...CommonStyles.shadowSm,
  },
  supportIcon: {
    width: 40,
    height: 40,
    backgroundColor: 'rgba(255, 107, 53, 0.1)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.md,
  },
});
