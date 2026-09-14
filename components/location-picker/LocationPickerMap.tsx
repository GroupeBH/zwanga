import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MapView, { Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from '@/utils/reanimated';
import { Colors } from '@/constants/styles';
import { pickerDisplayRoute, samePickerPoint, type PickerCoordinate } from '@/features/location-picker/locationPickerModel';

type Props = {
  enabled: boolean; target: PickerCoordinate; route: PickerCoordinate[]; restrictToRoute: boolean;
  onPanStart: () => void; onSettle: (point: PickerCoordinate) => void; onPress: (point: PickerCoordinate) => void;
};

/** The native map does not rerender for search text, address lookup or footer state. */
export const LocationPickerMap = memo(function LocationPickerMap({ enabled, target, route, restrictToRoute, onPanStart, onSettle, onPress }: Props) {
  const mapRef = useRef<MapView>(null);
  const [attempt, setAttempt] = useState(0);
  const attemptRef = useRef(attempt);
  attemptRef.current = attempt;
  const [ready, setReady] = useState(false);
  const [tilesReady, setTilesReady] = useState(Platform.OS !== 'android');
  const tilesReadyRef = useRef(Platform.OS !== 'android');
  const [slow, setSlow] = useState(false);
  const readyRef = useRef(false);
  const layoutReady = useRef(false);
  const loaded = useRef(false);
  const active = useRef(enabled);
  active.current = enabled;
  const targetRef = useRef(target);
  targetRef.current = target;
  const mapSession = useMemo(() => ({
    key: `${attempt}:${enabled ? 'open' : 'closed'}`,
    initialRegion: { ...targetRef.current, latitudeDelta: 0.015, longitudeDelta: 0.015 },
  }), [attempt, enabled]);
  const initialRegion = mapSession.initialRegion;
  const initialized = useRef(false);
  const lastCenter = useRef(target);
  const moving = useRef(false);
  const programmatic = useRef(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lift = useSharedValue(0);
  const pinStyle = useAnimatedStyle(() => ({ transform: [{ translateY: lift.value }] }));
  const displayedRoute = useMemo(() => pickerDisplayRoute(route), [route]);

  useEffect(() => {
    active.current = enabled;
    readyRef.current = false;
    layoutReady.current = false;
    loaded.current = false;
    initialized.current = false;
    programmatic.current = false;
    moving.current = false;
    lift.value = 0;
    setReady(false);
    tilesReadyRef.current = Platform.OS !== 'android';
    setTilesReady(tilesReadyRef.current);
    setSlow(false);
    const timer = enabled ? setTimeout(() => setSlow(true), 10_000) : undefined;
    loadingTimer.current = timer ?? null;
    return () => {
      active.current = false;
      readyRef.current = false;
      if (timer) clearTimeout(timer);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      if (unlockTimer.current) clearTimeout(unlockTimer.current);
      cancelAnimation(lift);
    };
  }, [attempt, enabled, lift]);

  useEffect(() => {
    if (!ready || !readyRef.current || !mapRef.current || !active.current || samePickerPoint(lastCenter.current, target)) return;
    programmatic.current = true;
    moving.current = false;
    lift.value = withTiming(0, { duration: 140 });
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (unlockTimer.current) clearTimeout(unlockTimer.current);
    try {
      mapRef.current.animateToRegion({ ...target, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 250);
      lastCenter.current = target;
    } catch { /* Reopening/retrying the map keeps the selected place intact. */ }
    unlockTimer.current = setTimeout(() => { programmatic.current = false; }, 700);
  }, [lift, ready, target]);

  const markReady = () => {
    if (!active.current || attemptRef.current !== attempt || !layoutReady.current || !loaded.current) return;
    if (!initialized.current) {
      lastCenter.current = initialRegion;
      initialized.current = true;
    }
    readyRef.current = true;
    if (tilesReadyRef.current && loadingTimer.current) clearTimeout(loadingTimer.current);
    setReady(true);
  };
  const settle = (region: Region) => {
    if (!active.current || attemptRef.current !== attempt || !readyRef.current) return;
    if (idleTimer.current) clearTimeout(idleTimer.current);
    // Intermediate camera callbacks must not repeatedly recenter the map.
    if (programmatic.current) return;
    const didMove = moving.current;
    moving.current = false;
    lift.value = withTiming(0, { duration: 140 });
    lastCenter.current = region;
    if (didMove) onSettle(region);
  };
  const pan = (region: Region) => {
    if (!active.current || attemptRef.current !== attempt || !readyRef.current || programmatic.current) return;
    if (!moving.current && samePickerPoint(lastCenter.current, region)) return;
    if (!moving.current) {
      moving.current = true;
      lift.value = withTiming(-10, { duration: 120 });
      onPanStart();
    }
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => settle(region), 500);
  };

  return (
    <View style={styles.workspace}>
      {enabled && (
        <MapView
          key={mapSession.key}
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={initialRegion}
          onMapReady={() => { if (!active.current || attemptRef.current !== attempt) return; loaded.current = true; markReady(); }}
          onMapLoaded={() => {
            if (!active.current || attemptRef.current !== attempt) return;
            tilesReadyRef.current = true;
            setTilesReady(true);
            if (loadingTimer.current) clearTimeout(loadingTimer.current);
          }}
          onLayout={event => {
            if (!active.current || attemptRef.current !== attempt) return;
            const { width, height } = event.nativeEvent.layout;
            layoutReady.current = Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0;
            if (!layoutReady.current) { readyRef.current = false; setReady(false); }
            markReady();
          }}
          onRegionChange={pan}
          onRegionChangeComplete={settle}
          onPanDrag={() => { programmatic.current = false; }}
          onPress={event => { if (readyRef.current) onPress(event.nativeEvent.coordinate); }}
          showsUserLocation={false}
          showsMyLocationButton={false}
          showsCompass={false}
          showsBuildings={false}
          showsIndoors={false}
          pitchEnabled={false}
          rotateEnabled={false}
          toolbarEnabled={false}
          moveOnMarkerPress={false}
        >
          {displayedRoute.length > 1 && <Polyline key="route" coordinates={displayedRoute} strokeColor={Colors.primary} strokeWidth={4} lineDashPattern={restrictToRoute ? undefined : [5, 5]} />}
        </MapView>
      )}
      {!ready && <View style={styles.loading} pointerEvents="none">
        <ActivityIndicator color={Colors.primary} />
        <Text style={styles.loadingText}>Préparation de la carte…</Text>
        <Text style={styles.loadingHint}>La recherche reste disponible.</Text>
      </View>}
      {ready && <>
        <View pointerEvents="none" style={styles.hint}><Text style={styles.hintText}>{!tilesReady ? 'Chargement du fond de carte…' : restrictToRoute ? 'Choisissez un point sur le trajet' : 'Déplacez la carte sous le repère'}</Text></View>
        <View pointerEvents="none" style={styles.pinAnchor}>
          <View style={styles.shadow} />
          <Animated.View style={[styles.pin, pinStyle]}><Ionicons name="location" size={44} color={Colors.primary} /></Animated.View>
        </View>
      </>}
      {(!ready || !tilesReady) && slow && <TouchableOpacity style={styles.retry} accessibilityRole="button" accessibilityLabel="Réessayer le chargement de la carte" onPress={() => setAttempt(value => value + 1)}>
        <Ionicons name="refresh" size={18} color={Colors.primary} /><Text style={styles.retryText}>Réessayer la carte</Text>
      </TouchableOpacity>}
    </View>
  );
});

const styles = StyleSheet.create({
  workspace: { flex: 1, backgroundColor: '#EEF0EC' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: Colors.gray[800], fontSize: 15, fontWeight: '600' },
  loadingHint: { color: Colors.gray[600], fontSize: 13 },
  hint: { position: 'absolute', alignSelf: 'center', top: 14, backgroundColor: Colors.white, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, maxWidth: '92%' },
  hintText: { color: Colors.gray[700], fontSize: 12, textAlign: 'center' },
  pinAnchor: { position: 'absolute', top: '50%', left: '50%', width: 0, height: 0 },
  pin: { position: 'absolute', left: -22, bottom: -2 },
  shadow: { position: 'absolute', width: 12, height: 5, borderRadius: 6, backgroundColor: '#00000030', left: -6, top: -2 },
  retry: { position: 'absolute', alignSelf: 'center', bottom: 20, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Colors.white, paddingHorizontal: 16, borderRadius: 22 },
  retryText: { color: Colors.primaryDark, fontWeight: '600' },
});
