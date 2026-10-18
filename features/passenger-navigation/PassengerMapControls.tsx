import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';
import type { usePassengerNavigationController } from '@/hooks/passenger-navigation/usePassengerNavigationController';

export function PassengerMapControls({ model }: { model: ReturnType<typeof usePassengerNavigationController> }) {
  const [more, setMore] = useState(false);
  const { state, camera, presentation, data } = model;
  return <View style={[s.container, { right: Math.max(data.insets.right, 12), bottom: state.isMapExpanded ? Math.max(data.insets.bottom, 10) : 10 }]}>
    {more && <View style={s.tools}>
      <TouchableOpacity style={s.tool} accessibilityRole="button" accessibilityLabel="Centrer sur ma position"
        disabled={!presentation.canCenterOnPassenger} accessibilityState={{ disabled: !presentation.canCenterOnPassenger }}
        onPress={camera.centerOnPassenger}>
        <Ionicons name="locate" size={22} color={presentation.canCenterOnPassenger ? Colors.primaryDark : Colors.gray[400]} /><Text style={s.label}>Moi</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.tool} accessibilityRole="button" accessibilityLabel="Centrer sur le conducteur"
        disabled={!state.driverLocation} accessibilityState={{ disabled: !state.driverLocation }} onPress={camera.centerOnDriver}>
        <Ionicons name="car-sport-outline" size={22} color={state.driverLocation ? Colors.primaryDark : Colors.gray[400]} /><Text style={s.label}>Conducteur</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.tool} accessibilityRole="button" accessibilityLabel="Actualiser l’itinéraire"
        disabled={state.isLoadingRoute} accessibilityState={{ disabled: state.isLoadingRoute, busy: state.isLoadingRoute }}
        onPress={() => { state.routeFetchedRef.current = false; state.lastRouteFetchRef.current = 0; void model.route.fetchRoute(); }}>
        {state.isLoadingRoute ? <ActivityIndicator color={Colors.primaryDark} /> : <Ionicons name="refresh" size={22} color={Colors.primaryDark} />}<Text style={s.label}>Actualiser</Text>
      </TouchableOpacity>
    </View>}
    <View style={s.row}>
      <TouchableOpacity style={s.button} accessibilityRole="button" accessibilityLabel={state.isMapExpanded ? 'Afficher les actions du trajet' : 'Agrandir la carte'}
        onPress={() => state.setIsMapExpanded(value => !value)}>
        <Ionicons name={state.isMapExpanded ? 'contract-outline' : 'expand-outline'} size={23} color={Colors.gray[800]} />
      </TouchableOpacity>
      <TouchableOpacity style={s.button} accessibilityRole="button" accessibilityLabel="Voir tout l’itinéraire" onPress={camera.fitToRoute}>
        <Ionicons name="map-outline" size={23} color={Colors.gray[800]} />
      </TouchableOpacity>
      <TouchableOpacity style={s.button} accessibilityRole="button" accessibilityLabel="Outils de la carte" accessibilityState={{ expanded: more }} onPress={() => setMore(value => !value)}>
        <Ionicons name={more ? 'close' : 'ellipsis-horizontal'} size={23} color={Colors.gray[800]} />
      </TouchableOpacity>
    </View>
  </View>;
}
const s = StyleSheet.create({
  container: { position: 'absolute', bottom: 10, gap: 8, alignItems: 'flex-end' },
  row: { flexDirection: 'row', gap: 8 },
  button: { minWidth: 44, minHeight: 44, borderRadius: 22, backgroundColor: Colors.white, alignItems: 'center', justifyContent: 'center', elevation: 2 },
  tools: { flexDirection: 'row', backgroundColor: Colors.white, borderRadius: 14, padding: 4, gap: 4 },
  tool: { minWidth: 60, minHeight: 48, padding: 5, alignItems: 'center', justifyContent: 'center', gap: 3 },
  label: { fontSize: 11, color: Colors.gray[700] },
});
