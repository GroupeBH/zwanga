import { BorderRadius, Colors, CommonStyles, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import type { SupportTicketSummary } from '@/types';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  formatSupportDate,
  TICKET_CATEGORY_LABELS,
  TICKET_STATUS_META,
} from './supportData';

export function SupportTicketCard({ ticket }: { ticket: SupportTicketSummary }) {
  const statusMeta = TICKET_STATUS_META[ticket.status];

  return (
    <View style={styles.ticketCard}>
      <View style={styles.ticketHeader}>
        <Text style={styles.ticketSubject}>{ticket.subject}</Text>
        <View style={[styles.ticketStatusPill, { backgroundColor: statusMeta.backgroundColor }]}>
          <Text style={[styles.ticketStatusText, { color: statusMeta.color }]}>
            {statusMeta.label}
          </Text>
        </View>
      </View>

      <View style={styles.ticketMetaRow}>
        <View style={styles.ticketMetaItem}>
          <Ionicons name="pricetag-outline" size={14} color={Colors.gray[500]} />
          <Text style={styles.ticketMetaText}>{TICKET_CATEGORY_LABELS[ticket.category]}</Text>
        </View>
        <View style={styles.ticketMetaItem}>
          <Ionicons name="time-outline" size={14} color={Colors.gray[500]} />
          <Text style={styles.ticketMetaText}>
            Mis a jour {formatSupportDate(ticket.updatedAt)}
          </Text>
        </View>
      </View>

      {ticket.resolutionSummary && (
        <Text style={styles.ticketSummary} numberOfLines={2}>
          {ticket.resolutionSummary}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ticketCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    ...CommonStyles.shadowSm,
  },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  ticketSubject: {
    flex: 1,
    color: Colors.gray[900],
    fontSize: FontSizes.base,
    fontWeight: FontWeights.semibold,
  },
  ticketStatusPill: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  ticketStatusText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
  },
  ticketMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  ticketMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  ticketMetaText: {
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
  },
  ticketSummary: {
    marginTop: Spacing.sm,
    color: Colors.gray[700],
    lineHeight: 20,
  },
});
