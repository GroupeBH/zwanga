import { useRequestCards } from '@/hooks/requests/useRequestCards';
import { useRequestsData } from '@/hooks/requests/useRequestsData';
import { styles } from '@/features/screen-styles/app/requests';
import { RequestsListState } from '@/features/requests/RequestsListState';
import { filterRequestIndex, indexRequests, type RequestTab } from '@/features/requests/requestsListModel';
import { Colors } from '@/constants/styles';
import type { TripRequest } from '@/types';
import { getTripRequestCreateHref, getTripRequestDetailHref } from '@/utils/requestNavigation';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Keyboard, RefreshControl, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const tabs: { key: RequestTab; label: string }[] = [
  { key: 'available', label: 'Disponibles' },
  { key: 'my-requests', label: 'Mes commandes' },
];
const requestKey = (request: TripRequest) => request.id;

export default function TripRequestsScreen() {
  const router = useRouter();
  const listRef = useRef<FlatList<TripRequest>>(null);
  const [requestedTab, setActiveTab] = useState<RequestTab>('available');
  const [search, setSearch] = useState('');
  const { activeTab, requests, isDriver, isLoading, isFetching, isError, hasData, proximityAvailable, refresh } = useRequestsData(requestedTab);
  const index = useMemo(() => indexRequests(requests), [requests]);
  const filteredRequests = useMemo(() => filterRequestIndex(index, search), [index, search]);
  const searching = Boolean(search.trim());
  const handleRequestPress = useCallback((id: string) => {
    Keyboard.dismiss();
    router.push(getTripRequestDetailHref(id));
  }, [router]);
  const { renderAvailableRequestCard, renderMyRequestCard } = useRequestCards({
    handleRequestPress, isDriverAccount: isDriver,
  });
  const changeSearch = useCallback((value: string) => {
    setSearch(value);
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);
  const changeTab = (tab: RequestTab) => {
    if (tab === activeTab) return;
    Keyboard.dismiss();
    changeSearch('');
    setActiveTab(tab);
  };
  const count = filteredRequests.length;
  const listDescription = searching ? `${count} résultat${count > 1 ? 's' : ''}`
    : `${count} commande${count > 1 ? 's' : ''}`;
  const sortDescription = activeTab === 'my-requests' ? 'Réponses et prises en charge en premier'
    : proximityAvailable ? 'Départs les plus proches en premier' : 'Départs les plus tôt en premier';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retour" activeOpacity={0.7}
          onPress={() => router.back()} style={styles.headerButton}>
          <Ionicons name="arrow-back" size={23} color={Colors.gray[900]} />
        </TouchableOpacity>
        <Text accessibilityRole="header" style={styles.headerTitle}>{isDriver ? 'Commandes de trajet' : 'Mes commandes'}</Text>
      </View>

      <View style={styles.toolbar}>
        {isDriver && <View style={styles.tabsContainer} accessibilityRole="tablist">
          {tabs.map(tab => <TouchableOpacity key={tab.key} accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab.key }} activeOpacity={0.75}
            onPress={() => changeTab(tab.key)} style={[styles.tab, activeTab === tab.key && styles.tabActive]}>
            <Text style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}>{tab.label}</Text>
          </TouchableOpacity>)}
        </View>}
        <Text style={styles.contextText}>
          {activeTab === 'my-requests' ? 'Vos commandes et les réponses des conducteurs.'
            : 'Des passagers à prendre en charge. Ouvrez une commande.'}
        </Text>
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={19} color={Colors.gray[500]} accessible={false} />
          <TextInput accessibilityLabel="Rechercher par départ, arrivée ou nom"
            placeholder="Départ, arrivée ou nom" placeholderTextColor={Colors.gray[500]}
            value={search} onChangeText={changeSearch} autoCorrect={false} returnKeyType="search"
            onSubmitEditing={() => Keyboard.dismiss()} style={styles.searchInput} />
          {search.length > 0 && <TouchableOpacity accessibilityRole="button" accessibilityLabel="Effacer la recherche"
            onPress={() => changeSearch('')} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color={Colors.gray[500]} />
          </TouchableOpacity>}
        </View>
      </View>

      <FlatList ref={listRef} data={filteredRequests} keyExtractor={requestKey}
        renderItem={activeTab === 'available' ? renderAvailableRequestCard : renderMyRequestCard}
        initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5}
        style={styles.list} contentContainerStyle={[styles.listContent, !count && styles.emptyListContent]}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={Boolean(isFetching && !isLoading)} onRefresh={refresh}
          colors={[Colors.primary]} tintColor={Colors.primary} />}
        ListHeaderComponent={<>
          {hasData && !isLoading && <View style={styles.resultsHeader}>
            <View style={styles.resultsCopy}>
              <Text style={styles.resultsCount}>{listDescription}</Text>
              <Text style={styles.resultsHint}>{sortDescription}</Text>
            </View>
            {isFetching && <ActivityIndicator size="small" color={Colors.primary} accessibilityLabel="Actualisation des commandes" />}
          </View>}
          {isError && hasData && count > 0 && <View style={styles.errorNotice}>
            <Text style={styles.errorText}>Actualisation impossible. Les dernières commandes chargées restent affichées.</Text>
            <TouchableOpacity accessibilityRole="button" onPress={refresh} disabled={isFetching}
              accessibilityState={{ disabled: isFetching }} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Réessayer</Text>
            </TouchableOpacity>
          </View>}
        </>}
        ListEmptyComponent={<RequestsListState loading={Boolean(isLoading)}
          error={Boolean(isError)} searching={searching} busy={Boolean(isFetching)} tab={activeTab}
          onRetry={refresh} onClearSearch={() => changeSearch('')} />}
      />

      {activeTab === 'my-requests' && <View style={styles.footer}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Commander un trajet"
          activeOpacity={0.8} style={styles.createButton} onPress={() => {
            Keyboard.dismiss();
            router.push(getTripRequestCreateHref());
          }}>
          <Ionicons name="add" size={22} color={Colors.white} />
          <Text style={styles.createButtonText}>Commander un trajet</Text>
        </TouchableOpacity>
      </View>}
    </SafeAreaView>
  );
}
