import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

export type AddressInputMode = 'map' | 'manual';

type AddressEntryModeSelectorProps = {
  mode: AddressInputMode;
  onChange: (mode: AddressInputMode) => void;
  title?: string;
  hint?: string;
  style?: StyleProp<ViewStyle>;
};

const OPTIONS: {
  mode: AddressInputMode;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
}[] = [
  {
    mode: 'map',
    icon: 'map-outline',
    title: 'Choisir sur la carte',
    description: 'Point précis, position actuelle ou lieu favori.',
  },
  {
    mode: 'manual',
    icon: 'create-outline',
    title: 'Adresse écrite',
    description: 'Adresse simple + repère si besoin.',
  },
];

export default function AddressEntryModeSelector({
  mode,
  onChange,
  title = 'Choisir la méthode',
  hint = 'Un seul choix pour les deux adresses.',
  style,
}: AddressEntryModeSelectorProps) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.headerRow}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>1</Text>
        </View>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.hint}>{hint}</Text>
        </View>
      </View>

      <View style={styles.optionStack}>
        {OPTIONS.map((option) => {
          const active = mode === option.mode;
          return (
            <TouchableOpacity
              key={option.mode}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              activeOpacity={0.9}
              style={[styles.option, active && styles.optionActive]}
              onPress={() => onChange(option.mode)}
            >
              <View style={[styles.optionIcon, active && styles.optionIconActive]}>
                <Ionicons
                  name={option.icon}
                  size={18}
                  color={active ? Colors.primary : Colors.gray[600]}
                />
              </View>
              <View style={styles.optionCopy}>
                <Text style={[styles.optionTitle, active && styles.optionTitleActive]}>{option.title}</Text>
                <Text style={styles.optionDescription}>{option.description}</Text>
              </View>
              <View style={[styles.checkCircle, active && styles.checkCircleActive]}>
                {active && <Ionicons name="checkmark" size={14} color={Colors.white} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    color: Colors.white,
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[900],
  },
  hint: {
    marginTop: 2,
    fontSize: FontSizes.sm,
    color: Colors.gray[500],
    lineHeight: 18,
  },
  optionStack: {
    gap: Spacing.sm,
  },
  option: {
    minHeight: 68,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Colors.white,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  optionActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '08',
  },
  optionIcon: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconActive: {
    backgroundColor: Colors.primary + '14',
  },
  optionCopy: {
    flex: 1,
  },
  optionTitle: {
    fontSize: FontSizes.base,
    fontWeight: FontWeights.bold,
    color: Colors.gray[800],
  },
  optionTitleActive: {
    color: Colors.primary,
  },
  optionDescription: {
    marginTop: 2,
    fontSize: FontSizes.sm,
    lineHeight: 18,
    color: Colors.gray[500],
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleActive: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary,
  },
});
