import { Colors } from '@/constants/styles';
import { styles } from './CompactTripCard.styles';
import { CompactCardAvatar } from './CompactCardAvatar';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View, type AccessibilityProps } from 'react-native';

type Props = {
  label: string;
  labelColor?: string;
  embedded?: boolean;
  departure: string;
  arrival: string;
  metadata: string;
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
  width, selected, disabled = false, inlineRoute = false, onPress, accessibilityLabel,
  accessibilityActions, onAccessibilityAction,
}: Props) {
  const stackedPriceHint = Boolean(priceHint && priceText && priceText.length > 8);
  return (
    <TouchableOpacity
      activeOpacity={0.86}
      accessibilityRole="button"
      disabled={disabled}
      accessibilityState={{ disabled, selected }}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={[label, `Départ : ${departure}. Destination : ${arrival}`, metadata,
        priceText && `${priceText}${priceHint ? ` ${priceHint}` : ''}`, badge, secondary].filter(Boolean).join('. ')}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onPress={disabled ? undefined : onPress}
      style={[styles.card, embedded && styles.embedded, selected && styles.selected, disabled && styles.disabled,
        width !== undefined && { width, alignSelf: 'flex-start' }]}
    >
      <View style={styles.header}>
        <Text style={[styles.label, labelColor ? { color: labelColor } : undefined]} numberOfLines={2}>{label}</Text>
        {priceText ? (
          <View style={styles.priceBlock}>
            <Text style={styles.price} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.9}>
              {priceText}{priceHint && !stackedPriceHint ? <Text style={styles.priceHint}> {priceHint}</Text> : null}
            </Text>
            {stackedPriceHint ? <Text style={styles.priceHint}>{priceHint}</Text> : null}
          </View>
        ) : null}
      </View>
      {inlineRoute ? (
        <View style={styles.inlineRoute}>
          <Text style={styles.place} numberOfLines={1}>{departure}</Text>
          <Ionicons name="arrow-forward" size={14} color={Colors.gray[500]} />
          <Text style={styles.place} numberOfLines={1}>{arrival}</Text>
        </View>
      ) : (
        <View style={styles.route}>
          <View style={styles.routeRow}>
            <View style={styles.departureDot} />
            <Text style={styles.place} numberOfLines={1}>{departure}</Text>
          </View>
          <View style={styles.routeRow}>
            <View style={styles.arrivalDot} />
            <Text style={styles.place} numberOfLines={1}>{arrival}</Text>
          </View>
        </View>
      )}
      <View style={styles.footer}>
        {avatarName ? (
          <>
            <CompactCardAvatar name={avatarName} uri={avatarUri} />
            <View style={styles.identityCopy}>
              {secondary ? <Text style={styles.secondary} numberOfLines={1}>{secondary}</Text> : null}
              <Text style={styles.identityMetadata} numberOfLines={2}>{metadata}</Text>
            </View>
          </>
        ) : <Text style={styles.metadata} numberOfLines={2}>{metadata}</Text>}
        {badge ? <Text style={styles.badge} numberOfLines={1}>{badge}</Text> : null}
        <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
      </View>
      {secondary && !avatarName ? <Text style={styles.secondary} numberOfLines={1}>{secondary}</Text> : null}
    </TouchableOpacity>
  );
});
