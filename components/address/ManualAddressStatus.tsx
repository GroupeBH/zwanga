import { Colors } from '@/constants/styles';
import type { ManualGeocodeStatus } from '@/utils/manualAddressGeocode';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

interface Props {
  status: ManualGeocodeStatus;
  foundLabel?: string;
  appearance: {
    manualGeocodeStatus: StyleProp<ViewStyle>;
    manualGeocodeStatusText: StyleProp<TextStyle>;
    manualGeocodeStatusTextFound: StyleProp<TextStyle>;
    manualGeocodeStatusTextMissing: StyleProp<TextStyle>;
  };
}

/** Shared address feedback, with the host screen's existing typography and spacing. */
export function ManualAddressStatus({ status, appearance, foundLabel = 'Coordonnées trouvées' }: Props) {
  if (status === 'idle') return null;
  const searching = status === 'searching', found = status === 'found';
  return (
    <View style={appearance.manualGeocodeStatus}>
      {searching ? <ActivityIndicator size="small" color={Colors.primary} /> : (
        <Ionicons name={found ? 'checkmark-circle' : 'alert-circle'} size={14} color={found ? Colors.success : Colors.danger} />
      )}
      <Text style={[
        appearance.manualGeocodeStatusText,
        found && appearance.manualGeocodeStatusTextFound,
        status === 'missing' && appearance.manualGeocodeStatusTextMissing,
      ]}>
        {searching ? 'Recherche des coordonnées...' : found ? foundLabel : 'Adresse introuvable'}
      </Text>
    </View>
  );
}
