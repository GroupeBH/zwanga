import React, { memo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '@/constants/styles';

type Props = { hasMore?: boolean; loading?: boolean; error?: boolean; loaded: number; onLoad: () => void };
export const HistoryPaginationFooter = memo(function HistoryPaginationFooter({ hasMore, loading, error, loaded, onLoad }: Props) {
  if (!hasMore && !loading) return null;
  return <View style={styles.container}>
    <Text style={styles.caption}>{loaded} élément{loaded > 1 ? 's' : ''} affiché{loaded > 1 ? 's' : ''}</Text>
    <TouchableOpacity accessibilityRole="button" disabled={loading} onPress={onLoad} style={styles.button}>
      {loading ? <ActivityIndicator color={Colors.primary} />
        : <Text style={styles.label}>{error ? 'Réessayer de charger la suite' : 'Charger la suite'}</Text>}
    </TouchableOpacity>
  </View>;
});
const styles = StyleSheet.create({
  container: { padding: 16, gap: 8, alignItems: 'center' },
  caption: { color: Colors.gray[600], fontSize: 13 },
  button: { minHeight: 48, paddingHorizontal: 24, justifyContent: 'center', borderRadius: 16, backgroundColor: Colors.gray[100] },
  label: { color: Colors.primary, fontWeight: '600' },
});
