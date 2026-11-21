import { Colors } from '@/constants/styles';
import { styles } from './CompactTripCard.styles';
import { CompactCardAvatar } from './CompactCardAvatar';
import { accentStyles, priorityAccents, prioritySurfaces, type HomePriorityAppearance, type SearchCardAppearance } from './CompactTripCard.variants';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, useWindowDimensions, View, type AccessibilityProps } from 'react-native';

type Props = {
  label: string;
  labelColor?: string;
  embedded?: boolean;
  departure: string;
  arrival: string;
  metadata: string;
  metadataPrefix?: string;
  priorityAppearance?: HomePriorityAppearance;
  searchAppearance?: SearchCardAppearance;
  unavailable?: boolean;
  secondary?: string;
  avatarName?: string;
  avatarUri?: string | null;
  priceText?: string;
  priceHint?: string;
  badge?: string;
  width?: number;
  selected?: boolean;
  disabled?: boolean;
  inlineRoute?: boolean;
  onPress: () => void;
} & Pick<AccessibilityProps, 'accessibilityLabel' | 'accessibilityActions' | 'onAccessibilityAction'>;

/** Presentation only: shared by Home priorities, previews and search results. */
export const CompactTripCard = React.memo(function CompactTripCard({
  label, labelColor, embedded, departure, arrival, metadata, secondary, avatarName, avatarUri, priceText, priceHint, badge,
  metadataPrefix, priorityAppearance, searchAppearance, unavailable = false,
  width, selected, disabled = false, inlineRoute = false, onPress, accessibilityLabel,
  accessibilityActions, onAccessibilityAction,
}: Props) {
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const stackedPriceHint = Boolean(priceHint && priceText && (largeText || priceText.length > 8));
  const priority = priorityAppearance ? priorityAccents[priorityAppearance] : undefined;
  const fullMetadata = metadataPrefix ? `${metadataPrefix} · ${metadata}` : metadata;
  const metadataContent = metadataPrefix ? <>
    <Text style={unavailable ? accentStyles.unavailable
      : searchAppearance === 'trip' ? accentStyles.available : accentStyles.requested}>{metadataPrefix}</Text>
    {` · ${metadata}`}
  </> : metadata;
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      accessibilityRole="button"
      disabled={disabled}
      accessibilityState={{ disabled, selected }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={[label, `Départ : ${departure}. Destination : ${arrival}`, fullMetadata,
        priceText && `${priceText}${priceHint ? ` ${priceHint}` : ''}`, badge, secondary].filter(Boolean).join('. ')}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onPress={disabled ? undefined : onPress}
      style={[styles.card, searchAppearance && accentStyles.searchSurface,
        priorityAppearance && prioritySurfaces[priorityAppearance],
        embedded && styles.embedded, selected && styles.selected, disabled && styles.disabled,
        width !== undefined && { width, alignSelf: 'flex-start' }]}
    >
      {priority ? <View pointerEvents="none" accessible={false}
        style={[accentStyles.priorityRail, { backgroundColor: priority.color }]} /> : null}
      <View style={[styles.header, largeText && styles.stackedHeader]}>
        {priority ? (
          <View style={[accentStyles.priorityLabel, largeText && styles.stackedLabel]}>
            <Ionicons name={priority.icon} size={14} color={priority.color} style={accentStyles.priorityIcon} accessible={false} />
            <Text style={[styles.label, { color: priority.color }]} numberOfLines={largeText ? undefined : 2}>{label}</Text>
          </View>
        ) : <Text style={[styles.label, largeText && styles.stackedLabel, searchAppearance && accentStyles.searchDate,
          labelColor ? { color: labelColor } : undefined]} numberOfLines={largeText ? undefined : 2}>{label}</Text>}
        {priceText ? (
          <View style={[styles.priceBlock, largeText && styles.fullPriceBlock]}>
            <Text style={[styles.price, searchAppearance && accentStyles.searchPrice]}>
              {priceText}{priceHint && !stackedPriceHint ? <Text style={styles.priceHint}> {priceHint}</Text> : null}
            </Text>
            {stackedPriceHint ? <Text style={styles.priceHint}>{priceHint}</Text> : null}
          </View>
        ) : null}
      </View>
      {inlineRoute && !largeText ? (
        <View style={styles.inlineRoute}>
          <Text style={styles.place} numberOfLines={1}>{departure}</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.gray[500]} />
          <Text style={styles.place} numberOfLines={1}>{arrival}</Text>
        </View>
      ) : (
        <View style={styles.route}>
          <View style={styles.routeRow}>
            <View style={styles.departureDot} />
            <Text style={styles.place} numberOfLines={largeText ? undefined : 1}>{departure}</Text>
          </View>
          <View style={styles.routeRow}>
            <View style={styles.arrivalDot} />
            <Text style={styles.place} numberOfLines={largeText ? undefined : 1}>{arrival}</Text>
          </View>
        </View>
      )}
      <View style={styles.footer}>
        {avatarName ? (
          <>
            <CompactCardAvatar name={avatarName} uri={avatarUri} />
            <View style={styles.identityCopy}>
              {secondary ? <Text style={styles.secondary} numberOfLines={largeText ? undefined : 1}>{secondary}</Text> : null}
              <Text style={styles.identityMetadata} numberOfLines={largeText ? undefined : 2}>{metadataContent}</Text>
            </View>
          </>
        ) : <Text style={styles.metadata} numberOfLines={largeText ? undefined : 2}>{metadataContent}</Text>}
        {badge ? <Text style={[styles.badge, searchAppearance && accentStyles.offers]} numberOfLines={largeText ? undefined : 1}>{badge}</Text> : null}
        <Ionicons name="chevron-forward" size={16} color={priority?.color ?? Colors.primary} />
      </View>
      {secondary && !avatarName ? <Text style={styles.secondary} numberOfLines={largeText ? undefined : 1}>{secondary}</Text> : null}
    </TouchableOpacity>
  );
});
