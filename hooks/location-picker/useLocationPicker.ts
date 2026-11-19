import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard } from 'react-native';
import { useGeocodeMutation, useReverseGeocodeMutation, type LandmarkPlace } from '@/store/api/googleMapsApi';
import { getGoogleMapsPlaceDetails, searchGoogleMapsPlaces, type GoogleMapsSearchSuggestion } from '@/utils/googleMapsPlaces';
import { findClosestPointOnRoute } from '@/utils/routeHelpers';
import { BoundedCache } from '@/utils/boundedCache';
import { useNavigationRequestGuard } from '@/hooks/navigation/useNavigationRequestGuard';
import { DEFAULT_PICKER_LOCATION, getPickerCoordinate, pointSelection, readableSelection, samePickerPoint, type MapLocationSelection, type PickerCoordinate } from '@/features/location-picker/locationPickerModel';
import { readableLocation, type ReadableLocation } from '@/utils/readableLocation';
import { requestCurrentLocation } from '@/services/currentLocationRequest';
import { checkForegroundLocationAccess } from '@/services/foregroundLocationAccess';
import { locationAccessMessage } from '@/features/location-picker/locationAccessMessage';
import { useLocationRecovery } from './useLocationRecovery';

type AddressLabel = ReadableLocation & Pick<MapLocationSelection, 'addressComponents'>;
const addresses = new BoundedCache<AddressLabel>(40);
const EMPTY_ROUTE: PickerCoordinate[] = [];
const ignoreMutationState = () => ({});

/** Mounted for one modal session. Only validated selections escape to the parent form. */
export function useLocationPicker({ initialLocation, initialSearchQuery = '', routeCoordinates, autoLocateOnOpen = false, active = true, onSelect, onClose }: {
  initialLocation?: MapLocationSelection | null; initialSearchQuery?: string;
  routeCoordinates?: PickerCoordinate[]; autoLocateOnOpen?: boolean; active?: boolean;
  onSelect: (selection: MapLocationSelection) => void | boolean; onClose: () => void;
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
  const searchAbortRef = useRef<AbortController | null>(null);
  const locateAgain = useRef<() => void>(() => {});
  const recovery = useLocationRecovery(() => locateAgain.current(), active);
  const { clear: clearRecovery, setIssue } = recovery;
  const { begin, cancel } = useNavigationRequestGuard(true, 'picker-selection');
  const [geocode] = useGeocodeMutation({ selectFromResult: ignoreMutationState });
  const [reverseGeocode] = useReverseGeocodeMutation({ selectFromResult: ignoreMutationState });

  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);

  // Keep the draft while the native map is suspended. Reopening must center on
  // the user's last pan/tap, not the camera target from before that gesture.
  useEffect(() => {
    if (active) return;
    setCameraTarget({ ...selectionRef.current });
    panningRef.current = false; setPanning(false);
  }, [active]);

  const closeSearch = useCallback(() => { setSearchOpen(false); Keyboard.dismiss(); }, []);
  const choose = useCallback((value: MapLocationSelection, lookupAddress = false, moveCamera = true) => {
    if (!activeRef.current) return;
    const point = normalize(value);
    if (!point) { setNotice('Choisissez un lieu situé en République démocratique du Congo.'); return; }
    clearRecovery();
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
  }, [cancel, clearRecovery, closeSearch, normalize]);

  // Search depends on what was typed, never on map movement or a returned address.
  useEffect(() => {
    const text = query.trim();
    let current = true;
    setSuggestions([]);
    setSearchNotice(null);
    if (!searchOpen || text.length < 3) { setSearching(false); return; }
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearching(true);
    const timer = setTimeout(() => {
      const promise = searchGoogleMapsPlaces(text, selectionRef.current, 5, controller.signal);
      void promise.then(results => {
        if (!current) return;
        setSuggestions(results);
        if (!results.length) setSearchNotice('Aucun lieu trouvé. Précisez le quartier ou choisissez sur la carte.');
      }).catch(() => {
        if (current) setSearchNotice('Recherche indisponible. Vous pouvez choisir un point sur la carte.');
      }).finally(() => { if (current) setSearching(false); });
    }, 550);
    return () => {
      current = false; clearTimeout(timer); controller.abort();
      if (searchAbortRef.current === controller) searchAbortRef.current = null;
    };
  }, [query, searchOpen]);

  useEffect(() => {
    if (!needsAddress || panning) { setAddressLoading(false); return; }
    let current = true;
    let request: ReturnType<typeof reverseGeocode> | undefined;
    const point = { latitude: selection.latitude, longitude: selection.longitude };
    const selectedAtStart = selectionRef.current;
    const key = `${point.latitude.toFixed(5)},${point.longitude.toFixed(5)}`;
    const apply = (label: AddressLabel) => {
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
        const label = { ...readableLocation(response), ...(response.addressComponents ? { addressComponents: response.addressComponents } : {}) };
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
    const controller = new AbortController();
    let geocodeRequest: ReturnType<typeof geocode> | undefined;
    token.attach({ abort: () => { controller.abort(); geocodeRequest?.abort(); } });
    closeSearch();
    setResolving(true);
    setLocating(false);
    setNotice(null);
    try {
      const text = typeof source === 'string' ? source : source.name;
      let suggestion = typeof source === 'string' ? undefined : source;
      if (!suggestion) {
        // Acquiring another lease before search closes preserves a pending identical read.
        const results = await searchGoogleMapsPlaces(text, selectionRef.current, 5, controller.signal);
        if (!token.isCurrent()) return;
        suggestion = results[0];
      }
      let point = suggestion?.coordinates.latitude != null && suggestion.coordinates.longitude != null
        ? getPickerCoordinate(suggestion.coordinates.latitude, suggestion.coordinates.longitude) : null;
      let name = suggestion?.name || text;
      let address = suggestion?.fullAddress || name;
      let placeTypes = suggestion?.placeType;
      let addressComponents: MapLocationSelection['addressComponents'];
      // A result already containing coordinates is usable immediately, even offline.
      if (!point && suggestion) {
        const detail = await getGoogleMapsPlaceDetails(suggestion.id, controller.signal);
        if (!token.isCurrent()) return;
        if (detail?.coordinates.latitude != null && detail.coordinates.longitude != null) {
          point = getPickerCoordinate(detail.coordinates.latitude, detail.coordinates.longitude);
          name = detail.name || name;
          address = detail.fullAddress || address;
          placeTypes = detail.placeType;
        }
      }
      if (!point) {
        const request = geocode({ address: text, region: 'cd' });
        geocodeRequest = request;
        const result = await request.unwrap();
        if (!token.isCurrent()) return;
        point = getPickerCoordinate(result.lat, result.lng);
        const label = readableLocation({ ...result, name });
        addressComponents = result.addressComponents;
        name = label.title;
        address = label.address;
      }
      if (!token.isCurrent()) return;
      if (point) choose({ ...point, title: name, address,
        ...(placeTypes ? { placeTypes } : {}), ...(addressComponents ? { addressComponents } : {}) });
      else setNotice('Ce lieu n’a pas pu être localisé. Choisissez un point sur la carte.');
    } catch {
      if (token.isCurrent()) setNotice('Impossible de localiser ce lieu pour le moment. Réessayez ou utilisez la carte.');
    } finally {
      if (token.isCurrent()) setResolving(false);
      token.finish();
    }
  }, [begin, choose, closeSearch, geocode]);

  const locate = useCallback(async () => {
    if (!activeRef.current || !active) return;
    const token = begin('gps');
    if (!token) return;
    setLocating(true);
    setResolving(false);
    setNotice(null);
    const controller = new AbortController();
    token.attach({ abort: () => controller.abort() });
    try {
      // Bound native reads, not the user's time in a permission dialog. GPS
      // itself already has a bounded, cancellable watch in requestCurrentLocation.
      const issue = await checkForegroundLocationAccess(controller.signal, token.isCurrent, true);
      if (!token.isCurrent()) return;
      setIssue(issue);
      if (issue) {
        setNotice(locationAccessMessage(issue));
        return;
      }
      const position = await requestCurrentLocation(true, controller.signal, {
        maxAge: 60_000, requiredAccuracy: 100, fallback: false,
      });
      if (!token.isCurrent()) return;
      if (!position) { setNotice('Position indisponible. Réessayez ou choisissez un point sur la carte.'); return; }
      const point = getPickerCoordinate(position.coords.latitude, position.coords.longitude);
      if (!point) { setNotice('Votre position est hors de la zone disponible. Choisissez un lieu en RDC.'); return; }
      choose(pointSelection(point, 'Ma position'), true);
    } catch {
      if (token.isCurrent()) setNotice('Position indisponible. Vérifiez le GPS ou choisissez sur la carte.');
    } finally {
      if (token.isCurrent()) setLocating(false);
      token.finish();
    }
  }, [active, begin, choose, setIssue]);
  locateAgain.current = () => { void locate(); };

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
    clearRecovery();
    touchedRef.current = true;
    cancel();
    setLocating(false);
    setResolving(false);
    panningRef.current = true;
    setPanning(true);
    closeSearch();
  }, [cancel, clearRecovery, closeSearch]);
  const settleMap = useCallback((point: PickerCoordinate) => {
    panningRef.current = false;
    setPanning(false);
    const valid = normalize(point);
    if (!valid) { setCameraTarget({ ...selectionRef.current }); return; }
    if (!samePickerPoint(valid, selectionRef.current)) choose(pointSelection(valid), true, !samePickerPoint(valid, point));
  }, [choose, normalize]);

  const close = useCallback(() => {
    activeRef.current = false;
    clearRecovery();
    searchAbortRef.current?.abort();
    cancel();
    closeSearch();
    onClose();
  }, [cancel, clearRecovery, closeSearch, onClose]);
  const confirm = useCallback(() => {
    if (!active || committedRef.current || !activeRef.current || panningRef.current || resolving || locating || searchOpen) return;
    const point = normalize(selectionRef.current);
    if (!point) return;
    committedRef.current = true;
    try {
      if (onSelect({ ...selectionRef.current, ...point }) === false) { committedRef.current = false; return; }
      close();
    } catch {
      committedRef.current = false;
      setNotice('Impossible de valider ce lieu. Réessayez.');
    }
  }, [active, close, locating, normalize, onSelect, resolving, searchOpen]);

  return {
    selection, cameraTarget, route, query, searchOpen, suggestions, searching, searchNotice,
    resolving, locating, panning, addressLoading, notice, recovery,
    setQuery: (text: string) => { clearRecovery(); touchedRef.current = true; cancel(); setLocating(false); setResolving(false); setQuery(text); setSearchOpen(true); },
    openSearch: () => { clearRecovery(); touchedRef.current = true; cancel(); setLocating(false); setResolving(false); setSearchOpen(true); }, closeSearch, choose, locate, resolvePlace,
    selectLandmark: (landmark: LandmarkPlace) => resolvePlace(landmark.query || landmark.name),
    startPanning, settleMap, confirm, close,
  };
}
