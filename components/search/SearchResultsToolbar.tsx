import { Colors } from '@/constants/styles';
import { styles } from '@/features/search/SearchResultsToolbar.styles';
import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';

export type SearchMode = 'trips' | 'requests';
export type SearchSortMode = 'cheap' | 'early' | 'nearby';
type SortOption = { value: SearchSortMode; label: string };

const TRIP_SORT_OPTIONS: readonly SortOption[] = [
  { value: 'cheap', label: 'Moins cher' },
  { value: 'early', label: 'Plus tôt' },
];
const REQUEST_SORT_OPTIONS: readonly SortOption[] = [
  { value: 'nearby', label: 'Plus proches' },
  { value: 'cheap', label: 'Meilleur budget' },
  { value: 'early', label: 'Plus tôt' },
];

type Props = {
  searchMode: SearchMode;
  sortMode: SearchSortMode;
  resultsCountLabel: string;
  isRefreshingResults: boolean;
  onSortChange: (mode: SearchSortMode) => void;
};

/** Separate rows keep the result count from collapsing behind three wide chips. */
export const SearchResultsToolbar = React.memo(function SearchResultsToolbar({
  searchMode,
  sortMode,
  resultsCountLabel,
  isRefreshingResults,
  onSortChange,
}: Props) {
  const options = searchMode === 'requests' ? REQUEST_SORT_OPTIONS : TRIP_SORT_OPTIONS;
  return (
    <View style={styles.container}>
      <View style={styles.countRow}>
        <Text style={styles.count}>{resultsCountLabel}</Text>
        {isRefreshingResults && <ActivityIndicator size="small" color={Colors.primary} />}
      </View>
      <View style={styles.sortOptions}>
        {options.map(option => {
          const selected = sortMode === option.value;
          return (
            <TouchableOpacity
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[styles.sortButton, selected && styles.sortButtonActive]}
              onPress={() => onSortChange(option.value)}
              activeOpacity={0.82}
            >
              <Text style={[styles.sortButtonText, selected && styles.sortButtonTextActive]}>
                {option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});
