import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/styles';

/** Keep the current choice visible; reveal only the controls being edited. */
export function FormDisclosure({ title, summary, forceOpen = false, children }: {
  title: string; summary?: string; forceOpen?: boolean; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const open = expanded || forceOpen;
  return <View style={s.section}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${title}. ${summary ?? ''}`}
      accessibilityState={{ expanded: open }} onPress={() => setExpanded(value => !value)} style={s.header}>
      <View style={s.copy}><Text style={s.title}>{title}</Text>
        {!!summary && <Text style={s.summary} numberOfLines={2}>{summary}</Text>}
      </View>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.gray[600]} />
    </Pressable>
    {open && <View style={s.content}>{children}</View>}
  </View>;
}
const s = StyleSheet.create({
  section: { borderTopWidth: 1, borderColor: Colors.gray[200] },
  header: { minHeight: 56, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1 }, title: { color: Colors.gray[900], fontSize: 15, fontWeight: '600' },
  summary: { color: Colors.gray[600], fontSize: 13, lineHeight: 19, marginTop: 3 },
  content: { paddingBottom: 12 },
});
