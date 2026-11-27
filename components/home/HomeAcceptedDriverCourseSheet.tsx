import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { HomeAcceptedDriverCourse } from '@/features/home/homeAcceptedDriverCourse';
import { styles as s } from '@/features/home/HomeRequestPickupSheet.styles';
import { HOME_DASHBOARD_COLORS as c } from '@/features/home/homeDashboardTheme';
import type { useHomeSheet } from '@/hooks/home/useHomeSheet';
import type { useHomeMapNavigation } from '@/hooks/home/useHomeMapNavigation';

type Props = { acceptedDriverCourse: HomeAcceptedDriverCourse; width: number }
  & Pick<ReturnType<typeof useHomeSheet>, 'sheetBottomOffset' | 'sheetHeight' | 'onSheetLayout'>
  & Pick<ReturnType<typeof useHomeMapNavigation>, 'openTripRequestDetail'>;

/** Participation cannot be dismissed like a suggestion, and opening it never starts the trip. */
export const HomeAcceptedDriverCourseSheet = React.memo(function HomeAcceptedDriverCourseSheet({
  acceptedDriverCourse: { trip, request }, width, sheetHeight, sheetBottomOffset, onSheetLayout, openTripRequestDetail,
}: Props) {
  const route = request ?? trip;
  const name = request?.passengerName || 'Votre passager';
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0]).join('').toUpperCase();
  const horizontal = width >= 600 && sheetHeight < 240;
  return <View testID="home-accepted-driver-course" onLayout={onSheetLayout}
    style={[s.sheet, horizontal && s.horizontalSheet, { bottom: sheetBottomOffset, height: sheetHeight }]}>
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.confirmed}>
        <Ionicons name="checkmark-circle" size={20} color={c.green} accessible={false} />
        <Text accessibilityRole="header" style={s.confirmedText}>Course acceptée</Text>
      </View>
      <View style={s.driver}>
        <View style={s.avatar} accessible={false}><Text style={s.initials}>{initials}</Text></View>
        <View style={s.copy}><Text style={s.name}>{name}</Text>
          <Text style={s.vehicle}>À prendre en charge</Text></View>
      </View>
      {(['departure', 'arrival'] as const).map((key, index) => <View key={key} style={s.pickup}>
        <Ionicons name={index ? 'location' : 'radio-button-on'} size={22} color={index ? c.orange : c.green} accessible={false} />
        <View style={s.copy}>
          <Text style={s.label}>{index ? 'Arrivée' : 'Départ du passager'}</Text>
          <Text style={s.place}>{route[key]?.name || route[key]?.address || 'Voir la course'}</Text>
          {route[key]?.reference ? <Text style={s.vehicle}>{route[key].reference}</Text> : null}
        </View>
      </View>)}
    </ScrollView>
    <View style={[s.footer, horizontal && s.horizontalFooter]}>
      <TouchableOpacity accessibilityRole="button" activeOpacity={0.85} style={s.action}
        accessibilityHint="Ouvrir la course acceptée et les actions de prise en charge, sans démarrer le trajet."
        onPress={() => openTripRequestDetail(trip.tripRequestId!)}>
        <Text style={s.actionText}>Voir ma prise en charge</Text>
        <Ionicons name="arrow-forward" size={20} color="#FFFFFF" accessible={false} />
      </TouchableOpacity>
    </View>
  </View>;
});
