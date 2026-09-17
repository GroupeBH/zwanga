import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FormModal as Modal } from '@/components/forms/FormLayout';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import { useGetLandmarksQuery } from '@/store/api/googleMapsApi';
import { useGetFavoriteLocationsQuery } from '@/store/api/userApi';
import { useLocationPicker } from '@/hooks/location-picker/useLocationPicker';
import { LocationPickerMap } from '@/components/location-picker/LocationPickerMap';
import { pointSelection, readableSelection, type MapLocationSelection, type PickerCoordinate } from '@/features/location-picker/locationPickerModel';
import { styles } from '@/features/location-picker/LocationPicker.styles';

export type { MapLocationSelection } from '@/features/location-picker/locationPickerModel';
type Props = {
  visible: boolean; title?: string; initialLocation?: MapLocationSelection | null;
  onClose: () => void; onSelect: (location: MapLocationSelection) => void;
  routeCoordinates?: PickerCoordinate[]; restrictToRoute?: boolean; autoLocateOnOpen?: boolean; initialSearchQuery?: string;
};

export default function LocationPickerModal(props: Props) {
  const [shown, setShown] = useState(false);
  useEffect(() => { if (!props.visible) setShown(false); }, [props.visible]);
  return (
    <Modal visible={props.visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent onShow={() => setShown(true)} onRequestClose={props.onClose}>
      {props.visible && <PickerContent {...props} mapEnabled={shown} />}
    </Modal>
  );
}

function PickerContent({ mapEnabled, title = 'Choisir un lieu', restrictToRoute = false, ...props }: Props & { mapEnabled: boolean }) {
  const insets = useSafeAreaInsets();
  const picker = useLocationPicker(props);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const { data: favorites } = useGetFavoriteLocationsQuery();
  const { data: landmarks } = useGetLandmarksQuery({ city: 'kinshasa', limit: 6 });
  const favoriteRows = useMemo(() => (favorites ?? []).map(favorite => ({
    id: favorite.id, ...readableSelection({ title: favorite.name, address: favorite.address, ...favorite.coordinates }),
  })), [favorites]);
  const { choose } = picker;
  const onMapPress = useCallback((point: PickerCoordinate) => choose(pointSelection(point), true), [choose]);
  const busy = picker.resolving || picker.locating;
  const confirmDisabled = busy || picker.panning || picker.searchOpen;
  const panelOpen = picker.searchOpen || favoritesOpen;
  const rows: { id: string; title: string; address: string; onPress: () => void }[] = picker.searchOpen
    ? picker.suggestions.map(item => ({ id: item.id, title: item.name, address: item.fullAddress, onPress: () => void picker.resolvePlace(item) }))
    : favoriteRows.map(item => ({ ...item, onPress: () => { choose(item); setFavoritesOpen(false); } }));

  return (
    <KeyboardAvoidingView style={[styles.container, { paddingTop: insets.top }]} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={styles.header}>
        <View style={styles.heading}>
          <Text style={styles.title} numberOfLines={2}>{title}</Text>
          {!picker.searchOpen && <Text style={styles.subtitle}>Recherchez un lieu ou ajustez le point.</Text>}
        </View>
        <TouchableOpacity style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Fermer le choix du lieu" onPress={picker.close}>
          <Ionicons name="close" size={23} color={Colors.gray[800]} />
        </TouchableOpacity>
      </View>

      <View style={[styles.search, picker.searchOpen && styles.searchFocused]}>
        <Ionicons name="search-outline" size={20} color={Colors.gray[600]} />
        <TextInput
          style={styles.input} value={picker.query} placeholder="Adresse, quartier, repère…" placeholderTextColor={Colors.gray[600]}
          accessibilityLabel="Rechercher une adresse, un quartier ou un repère"
          onChangeText={picker.setQuery} onFocus={() => { setFavoritesOpen(false); picker.openSearch(); }}
          onSubmitEditing={() => { if (picker.query.trim().length >= 3) void picker.resolvePlace(picker.query.trim()); }}
          returnKeyType="search" autoCorrect={false} autoComplete="off" maxLength={256}
        />
        {picker.searching ? <ActivityIndicator size="small" color={Colors.primary} /> : null}
        {picker.query.length > 0 && <TouchableOpacity style={styles.clearButton} accessibilityRole="button" accessibilityLabel="Effacer la recherche" onPress={() => picker.setQuery('')}>
          <Ionicons name="close-circle" size={20} color={Colors.gray[600]} />
        </TouchableOpacity>}
      </View>

      {!picker.searchOpen && <View style={styles.shortcuts}>
        <TouchableOpacity style={[styles.shortcut, favoritesOpen && styles.shortcutSelected]} accessibilityRole="button" accessibilityState={{ expanded: favoritesOpen }} onPress={() => { picker.closeSearch(); setFavoritesOpen(value => !value); }}>
          <Ionicons name="star-outline" size={17} color={Colors.primaryDark} /><Text style={styles.shortcutText}>Favoris</Text>
        </TouchableOpacity>
        <View style={styles.shortcutDivider} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.landmarks}>
          {(landmarks ?? []).map(landmark => <TouchableOpacity key={landmark.id} style={styles.landmark} accessibilityRole="button" onPress={() => { setFavoritesOpen(false); void picker.selectLandmark(landmark); }}>
            <Text style={styles.landmarkText} numberOfLines={1}>{landmark.name}</Text>
          </TouchableOpacity>)}
          {!landmarks?.length && <Text style={styles.shortcutsHint}>Vos lieux enregistrés</Text>}
        </ScrollView>
      </View>}

      <View style={styles.workspace}>
        <LocationPickerMap enabled={mapEnabled} target={picker.cameraTarget} route={picker.route} restrictToRoute={restrictToRoute}
          onPanStart={picker.startPanning} onSettle={picker.settleMap} onPress={onMapPress} />
        {!panelOpen && <TouchableOpacity style={styles.locate} accessibilityRole="button" accessibilityLabel="Utiliser ma position actuelle" accessibilityState={{ busy: picker.locating, disabled: picker.locating }} disabled={picker.locating} onPress={() => void picker.locate()}>
          {picker.locating ? <ActivityIndicator color={Colors.primary} size="small" /> : <Ionicons name="locate-outline" color={Colors.primaryDark} size={22} />}
          <Text style={styles.locateText}>Ma position</Text>
        </TouchableOpacity>}
        {panelOpen && <View style={styles.results}>
          <View style={styles.resultsHeader}>
            <Text style={styles.resultsHeading}>{picker.searchOpen ? 'Résultats de recherche' : 'Mes lieux favoris'}</Text>
            <TouchableOpacity style={styles.iconButton} accessibilityRole="button" accessibilityLabel="Revenir à la carte" onPress={() => { picker.closeSearch(); setFavoritesOpen(false); }}><Ionicons name="map-outline" size={20} color={Colors.primaryDark} /></TouchableOpacity>
          </View>
          <FlatList
            data={rows} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag"
            initialNumToRender={5} maxToRenderPerBatch={5} windowSize={3}
            renderItem={({ item }) => <TouchableOpacity style={styles.resultRow} accessibilityRole="button" onPress={item.onPress}>
              <Ionicons name={picker.searchOpen ? 'location-outline' : 'star-outline'} size={19} color={Colors.gray[600]} />
              <View style={styles.resultCopy}><Text style={styles.resultTitle} numberOfLines={1}>{item.title}</Text><Text style={styles.resultAddress} numberOfLines={2}>{item.address}</Text></View>
              <Ionicons name="arrow-up-outline" size={18} color={Colors.gray[500]} style={styles.resultArrow} />
            </TouchableOpacity>}
            ListEmptyComponent={<Text style={styles.empty}>{picker.searchOpen
              ? picker.searching ? 'Recherche en cours…' : picker.searchNotice || 'Saisissez au moins 3 caractères pour rechercher un lieu.'
              : 'Aucun favori pour le moment. Vos lieux enregistrés apparaîtront ici.'}</Text>}
          />
        </View>}
      </View>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        {picker.notice && <Text style={styles.notice} accessibilityLiveRegion="polite">{picker.notice}</Text>}
        {!picker.searchOpen && <View style={styles.selection}>
          <View style={styles.selectionIcon}><Ionicons name="location" size={23} color={Colors.primary} /></View>
          <View style={styles.selectionCopy}>
            <Text style={styles.selectionLabel}>{picker.panning ? 'AJUSTEZ LE POINT' : busy ? 'LOCALISATION EN COURS' : 'LIEU SÉLECTIONNÉ'}</Text>
            <Text style={styles.selectionTitle} numberOfLines={1}>{picker.selection.title}</Text>
            <Text style={styles.selectionAddress} numberOfLines={1}>{picker.addressLoading ? 'Adresse en cours de recherche · point déjà sélectionné' : picker.selection.address}</Text>
          </View>
          {busy && <ActivityIndicator size="small" color={Colors.primary} />}
        </View>}
        <TouchableOpacity style={[styles.confirm, confirmDisabled && styles.confirmDisabled]} accessibilityRole="button" accessibilityState={{ disabled: confirmDisabled }} disabled={confirmDisabled} onPress={picker.confirm}>
          <Text style={styles.confirmText}>{picker.searchOpen ? 'Choisissez un résultat' : picker.panning ? 'Relâchez la carte' : 'Utiliser ce lieu'}</Text><Ionicons name="checkmark" size={21} color={Colors.white} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}
