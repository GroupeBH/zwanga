import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Location from 'expo-location';
import { Keyboard } from 'react-native';
import { useGeocodeMutation, useReverseGeocodeMutation, type LandmarkPlace } from '@/store/api/googleMapsApi';
import { getGoogleMapsPlaceDetails, searchGoogleMapsPlaces, type GoogleMapsSearchSuggestion } from '@/utils/googleMapsPlaces';
import { findClosestPointOnRoute } from '@/utils/routeHelpers';
import { BoundedCache } from '@/utils/boundedCache';
import { useNavigationRequestGuard } from '@/hooks/navigation/useNavigationRequestGuard';
import { DEFAULT_PICKER_LOCATION, getPickerCoordinate, pointSelection, readableSelection, samePickerPoint, type MapLocationSelection, type PickerCoordinate } from '@/features/location-picker/locationPickerModel';
import { readableLocation, type ReadableLocation } from '@/utils/readableLocation';

const addresses = new BoundedCache<ReadableLocation>(40);
const EMPTY_ROUTE: PickerCoordinate[] = [];
const ignoreMutationState = () => ({});

/** Mounted for one modal session. Only validated selections escape to the parent form. */
export function useLocationPicker({ initialLocation, initialSearchQuery = '', routeCoordinates, autoLocateOnOpen = false, onSelect, onClose }: {
  initialLocation?: MapLocationSelection | null; initialSearchQuery?: string;
  routeCoordinates?: PickerCoordinate[]; autoLocateOnOpen?: boolean;
  onSelect: (selection: MapLocationSelection) => void; onClose: () => void;
}) {
  const route = useMemo(() => (routeCoordinates ?? EMPTY_ROUTE)
    .map(point => getPickerCoordinate(point.latitude, point.longitude))
    .filter((point): point is PickerCoordinate => point !== null), [routeCoordinates]);
  const normalize = useCallback((point: PickerCoordinate) => {
    const valid = getPickerCoordinate(point.latitude, point.longitude);
    if (!valid) return null;
    return route.length > 1 ? findClosestPointOnRoute(valid, route)?.closestPoint ?? valid : valid;
  }, [route]);
  const [selection, setSelection] = useState<MapLocationSelection>(() => {
    const source = initialLocation ?? DEFAULT_PICKER_LOCATION;
    const point = normalize(source) ?? normalize(DEFAULT_PICKER_LOCATION)!;
    const sourcePoint = getPickerCoordinate(source.latitude, source.longitude);
    return sourcePoint && samePickerPoint(point, sourcePoint) ? readableSelection({ ...source, ...point }) : pointSelection(point);
  });
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const [cameraTarget, setCameraTarget] = useState<PickerCoordinate>(selection);
  const [query, setQuery] = useState(initialSearchQuery);
  const [searchOpen, setSearchOpen] = useState(Boolean(initialSearchQuery));
  const [suggestions, setSuggestions] = useState<GoogleMapsSearchSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [panning, setPanning] = useState(false);
  const [needsAddress, setNeedsAddress] = useState(false);
  const [addressLoading, setAddressLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const activeRef = useRef(true);
  const committedRef = useRef(false);
  const panningRef = useRef(false);
  const touchedRef = useRef(false);
  const searchPromiseRef = useRef<{ query: string; promise: Promise<GoogleMapsSearchSuggestion[]> } | null>(null);
  const { begin, cancel } = useNavigationRequestGuard(true, 'picker-selection');
  const [geocode] = useGeocodeMutation({ selectFromResult: ignoreMutationState });
  const [reverseGeocode] = useReverseGeocodeMutation({ selectFromResult: ignoreMutationState });

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  const closeSearch = useCallback(() => { setSearchOpen(false); Keyboard.dismiss(); }, []);
  const choose = useCallback((value: MapLocationSelection, lookupAddress = false, moveCamera = true) => {
    if (!activeRef.current) return;
    const point = normalize(value);
    if (!point) { setNotice('Choisissez un lieu situé en République démocratique du Congo.'); return; }
    cancel();
    touchedRef.current = true;
    const changedBySnap = !samePickerPoint(point, getPickerCoordinate(value.latitude, value.longitude)!);
    const next = changedBySnap ? pointSelection(point) : readableSelection({ ...value, ...point });
    selectionRef.current = next;
    setSelection(next);
    setNeedsAddress(lookupAddress || changedBySnap);
    setNotice(null);
    setLocating(false);
    setResolving(false);
    setPanning(false);
    panningRef.current = false;
    if (moveCamera || changedBySnap) setCameraTarget(point);
    closeSearch();
  }, [cancel, closeSearch, normalize]);

  // Search depends on what was typed, never on map movement or a returned address.
  useEffect(() => {
    const text = query.trim();
    let current = true;
    setSuggestions([]);
    setSearchNotice(null);
    if (!searchOpen || text.length < 3) { setSearching(false); return; }
    setSearching(true);
    const timer = setTimeout(() => {
      const promise = searchGoogleMapsPlaces(text, selectionRef.current, 5);
      searchPromiseRef.current = { query: text, promise };
      void promise.then(results => {
        if (!current) return;
        setSuggestions(results);
        if (!results.length) setSearchNotice('Aucun lieu trouvé. Précisez le quartier ou choisissez sur la carte.');
      }).catch(() => {
        if (current) setSearchNotice('Recherche indisponible. Vous pouvez choisir un point sur la carte.');
      }).finally(() => { if (current) setSearching(false); });
    }, 550);
    return () => { current = false; clearTimeout(timer); };
  }, [query, searchOpen]);

  useEffect(() => {
    if (!needsAddress || panning) { setAddressLoading(false); return; }
    let current = true;
    let request: ReturnType<typeof reverseGeocode> | undefined;
    const point = { latitude: selection.latitude, longitude: selection.longitude };
    const selectedAtStart = selectionRef.current;
    const key = `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
    const apply = (label: ReadableLocation) => {
      if (current && activeRef.current && selectionRef.current === selectedAtStart) {
        const next = { ...selectionRef.current, ...label };
        selectionRef.current = next;
        setSelection(next);
        setNeedsAddress(false);
      }
    };
    const cached = addresses.get(key);
    if (cached) { apply(cached); return; }
    setAddressLoading(true);
    const timer = setTimeout(() => {
      request = reverseGeocode({ lat: point.latitude, lng: point.longitude, language: 'fr', region: 'cd' });
      void request.unwrap().then(response => {
        const label = readableLocation(response);
        if (current) addresses.set(key, label, 300_000);
        apply(label);
      }).catch(() => { /* The coordinate remains valid and can be confirmed offline. */ })
        .finally(() => { if (current) { setAddressLoading(false); setNeedsAddress(false); } });
    }, 400);
    return () => { current = false; clearTimeout(timer); request?.abort(); };
  }, [needsAddress, panning, reverseGeocode, selection.latitude, selection.longitude]);

  const resolvePlace = useCallback(async (source: GoogleMapsSearchSuggestion | string) => {
    touchedRef.current = true;
    const token = begin(typeof source === 'string' ? source : source.id);
    if (!token) return;
    closeSearch();
    setResolving(true);
    setLocating(false);
    setNotice(null);
    try {
      const text = typeof source === 'string' ? source : source.name;
      let suggestion = typeof source === 'string' ? undefined : source;
      if (!suggestion) {
        const pending = searchPromiseRef.current;
        const results = await (pending?.query === text ? pending.promise : searchGoogleMapsPlaces(text, selectionRef.current, 5));
        if (!token.isCurrent()) return;
        suggestion = results[0];
      }
      let point = suggestion?.coordinates.latitude != null && suggestion.coordinates.longitude != null
        ? getPickerCoordinate(suggestion.coordinates.latitude, suggestion.coordinates.longitude) : null;
      let name = suggestion?.name || text;
      let address = suggestion?.fullAddress || name;
      // A result already containing coordinates is usable immediately, even offline.
      if (!point && suggestion) {
        const detail = await getGoogleMapsPlaceDetails(suggestion.id);
        if (!token.isCurrent()) return;
        if (detail?.coordinates.latitude != null && detail.coordinates.longitude != null) {
          point = getPickerCoordinate(detail.coordinates.latitude, detail.coordinates.longitude);
          name = detail.name || name;
          address = detail.fullAddress || address;
        }
      }
      if (!point) {
        const request = geocode({ address: text, region: 'cd' });
        token.attach(request);
        const result = await request.unwrap();
        if (!token.isCurrent()) return;
        point = getPickerCoordinate(result.lat, result.lng);
        const label = readableLocation({ ...result, name });
        name = label.title;
        address = label.address;
      }
      if (!token.isCurrent()) return;
      if (point) choose({ ...point, title: name, address });
      else setNotice('Ce lieu n’a pas pu être localisé. Choisissez un point sur la carte.');
    } catch {
      if (token.isCurrent()) setNotice('Impossible de localiser ce lieu pour le moment. Réessayez ou utilisez la carte.');
    } finally {
      if (token.isCurrent()) setResolving(false);
      token.finish();
    }
  }, [begin, choose, closeSearch, geocode]);

  const locate = useCallback(async () => {
    const token = begin('gps');
    if (!token) return;
    setLocating(true);
    setResolving(false);
    setNotice(null);
    const timeout = setTimeout(() => {
      if (!token.isCurrent()) return;
      cancel();
      setLocating(false);
      setNotice('Votre position tarde à arriver. Vous pouvez choisir un point sur la carte.');
    }, 15_000);
    token.attach({ abort: () => clearTimeout(timeout) });
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!token.isCurrent()) return;
      if (permission.status !== 'granted') {
        setNotice('Localisation non autorisée. Recherchez un lieu ou choisissez sur la carte.');
        return;
      }
      const cached = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 100 });
      if (!token.isCurrent()) return;
      const position = cached ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      if (!token.isCurrent()) return;
      const point = getPickerCoordinate(position.coords.latitude, position.coords.longitude);
      if (!point) { setNotice('Votre position est hors de la zone disponible. Choisissez un lieu en RDC.'); return; }
      choose(pointSelection(point, 'Ma position'), true);
    } catch {
      if (token.isCurrent()) setNotice('Position indisponible. Vérifiez le GPS ou choisissez sur la carte.');
    } finally {
      clearTimeout(timeout);
      if (token.isCurrent()) setLocating(false);
      token.finish();
    }
  }, [begin, cancel, choose]);

  const initialAutoLocate = useRef(autoLocateOnOpen && !initialLocation);
  useEffect(() => {
    if (!initialAutoLocate.current) return;
    const timer = setTimeout(() => {
      if (!touchedRef.current) void locate();
      initialAutoLocate.current = false;
    }, 350);
    return () => clearTimeout(timer);
  }, [locate]);

  useEffect(() => {
    const point = normalize(selectionRef.current);
    if (point && !samePickerPoint(point, selectionRef.current)) choose(selectionRef.current);
  }, [choose, normalize]);

  const startPanning = useCallback(() => {
    if (panningRef.current) return;
    touchedRef.current = true;
    cancel();
    setLocating(false);
    setResolving(false);
    panningRef.current = true;
    setPanning(true);
    closeSearch();
  }, [cancel, closeSearch]);
  const settleMap = useCallback((point: PickerCoordinate) => {
    panningRef.current = false;
    setPanning(false);
    const valid = normalize(point);
    if (!valid) { setCameraTarget({ ...selectionRef.current }); return; }
    if (!samePickerPoint(valid, selectionRef.current)) choose(pointSelection(valid), true, !samePickerPoint(valid, point));
  }, [choose, normalize]);

  const close = useCallback(() => {
    activeRef.current = false;
    cancel();
    closeSearch();
    onClose();
  }, [cancel, closeSearch, onClose]);
  const confirm = useCallback(() => {
    if (committedRef.current || !activeRef.current || panningRef.current || resolving || locating || searchOpen) return;
    const point = normalize(selectionRef.current);
    if (!point) return;
    committedRef.current = true;
    try {
      onSelect({ ...selectionRef.current, ...point });
      close();
    } catch {
      committedRef.current = false;
      setNotice('Impossible de valider ce lieu. Réessayez.');
    }
  }, [close, locating, normalize, onSelect, resolving, searchOpen]);

  return {
    selection, cameraTarget, route, query, searchOpen, suggestions, searching, searchNotice,
    resolving, locating, panning, addressLoading, notice,
    setQuery: (text: string) => { touchedRef.current = true; cancel(); setLocating(false); setResolving(false); setQuery(text); setSearchOpen(true); },
    openSearch: () => { touchedRef.current = true; cancel(); setLocating(false); setResolving(false); setSearchOpen(true); }, closeSearch, choose, locate, resolvePlace,
    selectLandmark: (landmark: LandmarkPlace) => resolvePlace(landmark.query || landmark.name),
    startPanning, settleMap, confirm, close,
  };
}
