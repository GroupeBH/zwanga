import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { useHomeController } from '@/hooks/home/useHomeController';
import { getTripRequestCreateHref } from '@/utils/requestNavigation';
import { homePalette, styles } from '@/features/home/HomeDashboard.styles';
import { HomeFavoriteShortcuts } from './HomeFavoriteShortcuts';

type Props = Pick<ReturnType<typeof useHomeController>, 'isDriver' | 'firstName' | 'isOnline' | 'router'
  | 'currentUser' | 'isScreenActive' | 'availableDriverRequests' | 'availableTripRequestsLoading' | 'availableTripRequestsError'>;

export const HomeDashboardActions = React.memo(function HomeDashboardActions({ isDriver, firstName, isOnline,
  router, currentUser, isScreenActive, availableDriverRequests, availableTripRequestsLoading, availableTripRequestsError }: Props) {
  const count = availableDriverRequests.length;
  const clientCount = count > 0 ? String(count) : availableTripRequestsLoading ? '…'
    : availableTripRequestsError || !isOnline ? '—' : '0';
  return <View style={styles.actions}>
    <View style={styles.greetingRow}>
      <Text style={[styles.greeting, !isDriver && styles.passengerGreeting]} accessibilityRole="header">Bonjour {firstName}</Text>
      {(isDriver || !isOnline) && <View style={[styles.connection, !isOnline && styles.offline]}>
        <Ionicons name={isOnline ? 'ellipse' : 'cloud-offline-outline'} size={10} color={isOnline ? homePalette.green : homePalette.muted} />
        <Text style={[styles.connectionText, !isOnline && styles.offlineText]}>{isOnline ? 'Connecté' : 'Hors ligne'}</Text>
      </View>}
    </View>
    {isDriver ? <>
      <TouchableOpacity style={styles.primary} accessibilityRole="button" activeOpacity={0.8} onPress={() => router.push('/publish')}>
        <Ionicons name="add" size={25} color="#FFFFFF" />
        <Text style={styles.primaryText}>Publier un trajet</Text>
      </TouchableOpacity>
      <View style={styles.pair}>
        <TouchableOpacity style={[styles.tile, styles.clientsTile]} accessibilityRole="button" activeOpacity={0.8} onPress={() => router.push('/requests')}>
          <Text style={[styles.tileLabel, styles.clientsText]}>Clients à découvrir</Text><Text style={[styles.tileValue, styles.clientsText]}>{clientCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tile} accessibilityRole="button" activeOpacity={0.8} onPress={() => router.push('/driver-earnings')}>
          <Text style={styles.tileLabel}>Mes revenus</Text><Text style={styles.tileLink}>Voir mes gains →</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={styles.textLink} accessibilityRole="button" activeOpacity={0.8} onPress={() => router.push(getTripRequestCreateHref())}>
        <Text style={styles.textLinkLabel}>Commander un trajet pour moi</Text>
      </TouchableOpacity>
    </> : <>
      <TouchableOpacity style={styles.search} accessibilityRole="button"
        accessibilityHint="Ouvre la recherche pour saisir votre destination." activeOpacity={0.8} onPress={() => router.push('/search')}>
        <Ionicons name="search" size={22} color={homePalette.green} /><Text style={styles.searchText}>Où allez-vous ?</Text>
      </TouchableOpacity>
      <HomeFavoriteShortcuts router={router} isScreenActive={isScreenActive} userId={currentUser?.id} />
      <View style={styles.pair}>
        <TouchableOpacity style={styles.secondary} accessibilityRole="button" activeOpacity={0.8} onPress={() => router.push('/publish')}>
          <Text style={styles.secondaryText}>Proposer un trajet</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.secondary, styles.order]} accessibilityRole="button" activeOpacity={0.8} onPress={() => router.push(getTripRequestCreateHref())}>
          <Text style={styles.secondaryText}>Commander</Text>
        </TouchableOpacity>
      </View>
    </>}
  </View>;
});
