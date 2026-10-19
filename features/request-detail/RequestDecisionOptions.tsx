import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Colors } from '@/constants/styles';
import type { useRequestDetailController } from '@/hooks/request-detail/useRequestDetailController';
import { LANDMARK_PLACEHOLDER } from './requestDetailModel';

type Model = ReturnType<typeof useRequestDetailController>;

/** Optional settings share the main decision form, never a second acceptance modal. */
export function RequestDecisionOptions({ model, disabled }: { model: Model; disabled: boolean }) {
  const expanded = model.areDirectOptionsExpanded;
  return <View>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded, disabled }} disabled={disabled}
      onPress={() => { if (!disabled) model.setAreDirectOptionsExpanded(current => !current); }} style={styles.toggle}>
      <Text style={styles.toggleText}>Autres options</Text>
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.gray[600]} />
    </Pressable>
    {expanded && <View style={styles.fields}>
      <View style={styles.kyc}>
        <View style={styles.copy}>
          <Text style={styles.label}>Passager vérifié uniquement</Text>
          <Text style={styles.hint}>Son identité devra être validée avant le trajet.</Text>
        </View>
        <Switch accessibilityLabel="Exiger un passager avec une identité vérifiée" disabled={disabled}
          value={model.directAcceptRequiresPassengerKyc}
          onValueChange={value => { if (!disabled) model.setDirectAcceptRequiresPassengerKyc(value); }} />
      </View>
      <Text style={styles.hint}>Changer les lieux seulement si nécessaire.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Changer le point de départ" disabled={disabled}
        onPress={() => { if (!disabled) model.openDirectRouteOverridePicker('directDeparture', true); }} style={styles.location}>
        <Ionicons name="location-outline" size={18} color={Colors.primary} />
        <View style={styles.copy}>
          <Text style={styles.label}>Point de départ</Text>
          <Text style={styles.hint}>{model.directAcceptDepartureLocation?.title || model.directAcceptDepartureLocation?.address || model.tripRequest?.departure?.name}</Text>
        </View>
        <Text style={styles.change}>Changer</Text>
      </Pressable>
      <TextInput accessibilityLabel="Repère au départ" editable={!disabled} style={styles.input}
        placeholder={LANDMARK_PLACEHOLDER} placeholderTextColor={Colors.gray[500]}
        value={model.directAcceptDepartureReference}
        onChangeText={value => { if (!disabled) model.setDirectAcceptDepartureReference(value); }} />
      <Pressable accessibilityRole="button" accessibilityLabel="Changer le point d’arrivée" disabled={disabled}
        onPress={() => { if (!disabled) model.openDirectRouteOverridePicker('directArrival', true); }} style={styles.location}>
        <Ionicons name="flag-outline" size={18} color={Colors.primary} />
        <View style={styles.copy}>
          <Text style={styles.label}>Point d’arrivée</Text>
          <Text style={styles.hint}>{model.directAcceptArrivalLocation?.title || model.directAcceptArrivalLocation?.address || model.tripRequest?.arrival?.name}</Text>
        </View>
        <Text style={styles.change}>Changer</Text>
      </Pressable>
      <TextInput accessibilityLabel="Repère à l’arrivée" editable={!disabled} style={styles.input}
        placeholder={LANDMARK_PLACEHOLDER} placeholderTextColor={Colors.gray[500]}
        value={model.directAcceptArrivalReference}
        onChangeText={value => { if (!disabled) model.setDirectAcceptArrivalReference(value); }} />
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  toggle: { minHeight: 44, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontSize: 14, color: Colors.gray[600] }, fields: { gap: 10, paddingBottom: 8 },
  kyc: { flexDirection: 'row', alignItems: 'center', gap: 8 }, copy: { flex: 1, gap: 3 },
  label: { color: Colors.gray[900], fontWeight: '600', fontSize: 14 },
  hint: { fontSize: 13, lineHeight: 18, color: Colors.gray[600] },
  location: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8 },
  change: { fontWeight: '600', color: Colors.primaryDark, fontSize: 14 },
  input: { minHeight: 44, padding: 10, borderWidth: 1, borderColor: Colors.gray[300], borderRadius: 10,
    backgroundColor: Colors.white, color: Colors.gray[900], fontSize: 14 },
});
