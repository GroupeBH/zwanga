import { HOME_DASHBOARD_COLORS as c } from '@/features/home/homeDashboardTheme';
import { Ionicons } from '@expo/vector-icons';
import React, { Children, isValidElement, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type HomeMapPriorityLayout = { top: number; bottom: number; compact?: boolean };

type Props = {
  layout: HomeMapPriorityLayout;
  enabled: boolean;
  children: React.ReactNode;
};

/** One mounted priority, outside MapView. Paging never competes with swipe-to-dismiss. */
export function HomeMapPriorities({ layout, enabled, children }: Props) {
  const cards = Children.toArray(children).filter(isValidElement);
  const [selectedKey, setSelectedKey] = useState<React.Key | null>(null);
  const index = Math.max(0, cards.findIndex(card => card.key === selectedKey));
  if (!cards.length) return null;
  return (
    <View testID="home-map-priorities" pointerEvents="box-none"
      style={[styles.overlay, { top: layout.top, bottom: layout.bottom }, layout.compact && styles.compact]}>
      <ScrollView key={cards[index].key} style={[styles.cardViewport, cards.length > 1 && styles.pagedViewport]}
        showsVerticalScrollIndicator nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {cards[index]}
      {cards.length > 1 && <View style={styles.pager}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Priorité précédente"
          accessibilityState={{ disabled: !enabled || index === 0 }} disabled={!enabled || index === 0}
          style={[styles.pageButton, index === 0 && styles.disabled]}
          onPress={() => setSelectedKey(cards[index - 1].key)}>
          <Ionicons name="chevron-back" size={20} color={c.ink} />
        </TouchableOpacity>
        <Text style={styles.count} accessibilityLiveRegion="polite"
          accessibilityLabel={`Priorité ${index + 1} sur ${cards.length}`}>{index + 1} / {cards.length}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Priorité suivante"
          accessibilityState={{ disabled: !enabled || index === cards.length - 1 }} disabled={!enabled || index === cards.length - 1}
          style={[styles.pageButton, index === cards.length - 1 && styles.disabled]}
          onPress={() => setSelectedKey(cards[index + 1].key)}>
          <Ionicons name="chevron-forward" size={20} color={c.ink} />
        </TouchableOpacity>
      </View>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', left: 16, right: 16, zIndex: 10, justifyContent: 'flex-end' },
  compact: { right: 80 },
  cardViewport: { flexGrow: 0, flexShrink: 1, maxHeight: 136, borderRadius: 18 },
  pagedViewport: { maxHeight: 184 },
  pager: { flexShrink: 0, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 24, marginTop: 4 },
  pageButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.3 },
  count: { color: c.ink, fontSize: 12, fontWeight: '600', paddingHorizontal: 8 },
});
