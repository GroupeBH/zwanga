import { Colors } from '@/constants/styles';
import { styles } from '@/features/profile/ProfileHeader.styles';
import type { useProfileController } from '@/hooks/profile/useProfileController';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Image,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

type Props = Pick<ReturnType<typeof useProfileController>,
  | 'changeProfilePhoto'
  | 'currentUser'
  | 'displaysDriverRole'
  | 'isPremiumActive'
  | 'isUploading'
  | 'router'
  | 'user'
>;

export function ProfileHeader({
  changeProfilePhoto,
  currentUser,
  displaysDriverRole,
  isPremiumActive,
  isUploading,
  router,
  user,
}: Props) {
  return (<View style={styles.header}>
    <View style={styles.headerTop}>
      <View style={styles.headerTitleGroup}>
        <View style={styles.headerTitleAccent} />
        <Text style={styles.headerTitle}>Mon profil</Text>
      </View>
      <TouchableOpacity
        accessibilityLabel="Ouvrir les paramètres"
        style={styles.settingsButton}
        onPress={() => router.push('/settings')}
      >
        <Ionicons name="settings-outline" size={22} color={Colors.gray[800]} />
      </TouchableOpacity>
    </View>

    <View style={styles.userInfo}>
      <TouchableOpacity
        style={styles.avatarContainer}
        onPress={changeProfilePhoto}
        disabled={isUploading}
        activeOpacity={0.8}
      >
        <View style={styles.avatarWrapper}>
          {currentUser?.profilePicture || user?.avatar ? (
            <Image
              source={{
                uri: currentUser?.profilePicture ?? user?.avatar ?? undefined,
              }}
              style={styles.avatarImage}
            />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarEmoji}>👤</Text>
            </View>
          )}
          {isUploading && (
            <View style={styles.uploadingOverlay}>
              <ActivityIndicator size="small" color={Colors.white} />
            </View>
          )}
        </View>
        {currentUser?.identityVerified && (
          <View style={styles.verifiedBadge}>
            <Ionicons name="checkmark-sharp" size={14} color={Colors.white} />
          </View>
        )}
        <TouchableOpacity style={styles.cameraBadge} onPress={changeProfilePhoto} disabled={isUploading}>
          <Ionicons name="camera" size={14} color={Colors.white} />
        </TouchableOpacity>
      </TouchableOpacity>
      <View style={styles.userIdentityBlock}>
        <Text numberOfLines={1} style={styles.userName}>
          {currentUser?.name || 'Utilisateur'}
        </Text>
        <View style={styles.userPhoneRow}>
          <Ionicons name="call-outline" size={14} color={Colors.gray[500]} />
          <Text numberOfLines={1} style={styles.userPhone}>
            {currentUser?.phone || ''}
          </Text>
        </View>
        <View style={styles.userRoleRow}>
          <View style={styles.userRolePill}>
            <Ionicons
              name={displaysDriverRole ? 'car-outline' : 'person-outline'}
              size={12}
              color={Colors.primaryDark}
            />
            <Text style={styles.userRolePillText}>{displaysDriverRole ? 'Conducteur' : 'Passager'}</Text>
          </View>
          {isPremiumActive ? (
            <View style={styles.userRolePill}>
              <Ionicons name="shield-checkmark-outline" size={12} color={Colors.primaryDark} />
              <Text style={styles.userRolePillText}>Pro</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  </View>);
}
