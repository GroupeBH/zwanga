import { Colors } from '@/constants/styles';
import { styles } from '@/features/screen-styles/app/tabs/trips';
import type { MainTab, SubTab } from '@/features/trips/tripsModel';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';

interface TripsHeaderProps {
  mainTab: MainTab;
  subTab: SubTab;
  searchQuery: string;
  onMainTabChange: (tab: MainTab) => void;
  onSubTabChange: (tab: SubTab) => void;
  onSearchChange: (query: string) => void;
  onPublish: () => void;
}

export function TripsHeader({
  mainTab,
  subTab,
  searchQuery,
  onMainTabChange,
  onSubTabChange,
  onSearchChange,
  onPublish,
}: TripsHeaderProps) {
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  const searchVisible = searchExpanded || searchQuery.length > 0;

  useEffect(() => {
    if (searchExpanded) searchInputRef.current?.focus();
  }, [searchExpanded]);

  const toggleSearch = () => {
    if (searchVisible) {
      onSearchChange('');
      setSearchExpanded(false);
      Keyboard.dismiss();
    } else {
      setSearchExpanded(true);
    }
  };

  const selectMainTab = (tab: MainTab) => {
    onMainTabChange(tab);
    onSubTabChange('upcoming');
  };

  return (
    <View style={styles.header}>
      <View style={styles.headerTopRow}>
        <Text style={styles.headerTitle}>Mes trajets</Text>
        <TouchableOpacity
          style={styles.headerPublishButton}
          onPress={onPublish}
          accessibilityRole="button"
          accessibilityLabel="Publier un trajet"
        >
          <Ionicons name="add" size={20} color={Colors.white} />
          <Text style={styles.headerPublishText}>Publier</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.mainTabsContainer} accessibilityRole="tablist">
        <TouchableOpacity
          style={[styles.mainTab, mainTab === 'published' && styles.mainTabActive]}
          onPress={() => selectMainTab('published')}
          accessibilityRole="tab"
          accessibilityState={{ selected: mainTab === 'published' }}
        >
          <Text numberOfLines={1} style={[styles.mainTabText, mainTab === 'published' && styles.mainTabTextActive]}>
            Publiés
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.mainTab, mainTab === 'bookings' && styles.mainTabActive]}
          onPress={() => selectMainTab('bookings')}
          accessibilityRole="tab"
          accessibilityState={{ selected: mainTab === 'bookings' }}
        >
          <Text numberOfLines={1} style={[styles.mainTabText, mainTab === 'bookings' && styles.mainTabTextActive]}>
            Réservations
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <View style={styles.subTabsContainer} accessibilityRole="tablist">
          <TouchableOpacity
            style={[styles.subTab, subTab === 'upcoming' && styles.subTabActive]}
            onPress={() => onSubTabChange('upcoming')}
            accessibilityRole="tab"
            accessibilityState={{ selected: subTab === 'upcoming' }}
          >
            <Text numberOfLines={1} style={[styles.subTabText, subTab === 'upcoming' && styles.subTabTextActive]}>
              À venir
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.subTab, subTab === 'completed' && styles.subTabActive]}
            onPress={() => onSubTabChange('completed')}
            accessibilityRole="tab"
            accessibilityState={{ selected: subTab === 'completed' }}
          >
            <Text numberOfLines={1} style={[styles.subTabText, subTab === 'completed' && styles.subTabTextActive]}>
              Historique
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          style={[styles.searchToggle, searchVisible && styles.searchToggleActive]}
          onPress={toggleSearch}
          accessibilityRole="button"
          accessibilityLabel={searchVisible ? 'Fermer la recherche' : 'Rechercher dans mes trajets'}
          accessibilityState={{ expanded: searchVisible }}
        >
          <Ionicons name={searchVisible ? 'close' : 'search-outline'} size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
      </View>

      {searchVisible && (
        <View style={styles.searchContainer}>
          <Ionicons name="search-outline" size={18} color={Colors.gray[600]} />
          <TextInput
            ref={searchInputRef}
            value={searchQuery}
            onChangeText={onSearchChange}
            placeholder="Lieu ou trajet…"
            accessibilityLabel="Rechercher un lieu ou un trajet"
            maxLength={100}
            placeholderTextColor={Colors.gray[500]}
            style={styles.searchInput}
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {searchQuery.length > 0 && Platform.OS !== 'ios' && (
            <TouchableOpacity
              style={styles.searchClearButton}
              onPress={() => onSearchChange('')}
              accessibilityRole="button"
              accessibilityLabel="Effacer la recherche"
            >
              <Ionicons name="close-circle" size={20} color={Colors.gray[600]} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}
