import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { getInitials } from '@/features/home/homeModel';
import { styles } from '@/features/home/HomeHeader.styles';
import type { useHomeContext } from '@/hooks/home/useHomeContext';
import type { useHomeSheet } from '@/hooks/home/useHomeSheet';

type Props = Pick<ReturnType<typeof useHomeContext>, 'insets' | 'router'>
  & Pick<ReturnType<typeof useHomeSheet>, 'avatarUri' | 'firstName' | 'unreadNotifications'>;
export const HomeHeader = React.memo(function HomeHeader({ insets, router, avatarUri,
  firstName, unreadNotifications }: Props) {
  return <View pointerEvents="box-none" style={[styles.topOverlay, { top: insets.top + 12 }]}>
    <TouchableOpacity style={styles.roundButton} accessibilityRole="button" accessibilityLabel="Ouvrir le profil"
      activeOpacity={0.8} onPress={() => router.push('/profile')}>
      {avatarUri ? <Image source={{ uri: avatarUri }} style={styles.avatar} resizeMode="cover" />
        : <Text style={styles.initial}>{getInitials(firstName)}</Text>}
    </TouchableOpacity>
    <TouchableOpacity style={styles.roundButton} accessibilityRole="button" accessibilityLabel={unreadNotifications
      ? `Ouvrir les notifications, ${unreadNotifications} non lues` : 'Ouvrir les notifications'}
      activeOpacity={0.8} onPress={() => router.push('/notifications')}>
      <Ionicons name="notifications-outline" size={25} color="#211F1C" />
      {unreadNotifications > 0 && <View style={styles.badge}><Text style={styles.badgeText}>
        {unreadNotifications > 9 ? '9+' : unreadNotifications}
      </Text></View>}
    </TouchableOpacity>
  </View>;
});
