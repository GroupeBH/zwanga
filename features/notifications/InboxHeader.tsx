import { Ionicons } from '@expo/vector-icons';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { inboxStyles as s } from './inboxStyles';
import type { InboxSection } from './inboxSections';

const sections = [
  { key: 'activity', label: 'Activité' },
  { key: 'support', label: 'Assistance' },
  { key: 'messages', label: 'Messages' },
] as const;

export function InboxHeader({ section, unreadActivity, unreadMessages, onSelect, onBack }: {
  section: InboxSection; unreadActivity: number; unreadMessages: number;
  onSelect: (section: InboxSection) => void; onBack: () => void;
}) {
  return <View style={s.header}>
    <View style={s.titleRow}>
      <TouchableOpacity style={s.iconButton} accessibilityRole="button" accessibilityLabel="Retour"
        onPress={onBack}><Ionicons name="arrow-back" size={24} color="#17213A" /></TouchableOpacity>
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={s.title}>Notifications</Text>
    </View>
    <ScrollView horizontal contentContainerStyle={s.tabs}
      accessibilityRole="tablist">
      {sections.map(({ key, label }) => {
        const selected = section === key;
        const count = key === 'messages' ? unreadMessages : key === 'activity' ? unreadActivity : 0;
        return <TouchableOpacity key={key} accessibilityRole="tab" accessibilityState={{ selected }}
          accessibilityLabel={`${label}${count > 0 ? `, ${count} non lus` : ''}`} activeOpacity={0.75}
          onPress={() => onSelect(key)} style={[s.tab, selected && s.tabSelected]}>
          <Text style={[s.tabLabel, selected && s.tabLabelSelected]}>{label}</Text>
          {count > 0 && <View style={[s.badge, selected && s.badgeSelected]}>
            <Text maxFontSizeMultiplier={1.3} style={[s.badgeText, selected && s.badgeTextSelected]}>{count > 99 ? '99+' : count}</Text>
          </View>}
        </TouchableOpacity>;
      })}
    </ScrollView>
  </View>;
}
