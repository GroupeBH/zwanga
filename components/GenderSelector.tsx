import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import type { UserGender } from '@/types';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type GenderSelectorProps = {
  value: UserGender | null;
  onChange: (gender: UserGender) => void;
  label?: string;
  compact?: boolean;
  allowedGenders?: readonly UserGender[];
};

const GENDER_OPTIONS: { value: UserGender; label: string; compactLabel?: string }[] = [
  { value: 'male', label: 'Homme' },
  { value: 'female', label: 'Femme' },
  { value: 'other', label: 'Autre' },
  { value: 'prefer_not_to_say', label: 'Ne pas préciser', compactLabel: 'Non précisé' },
];

export function GenderSelector({
  value,
  onChange,
  label = 'Sexe (facultatif)',
  compact = false,
  allowedGenders,
}: GenderSelectorProps) {
  const displayedOptions = allowedGenders
    ? GENDER_OPTIONS.filter((option) => allowedGenders.includes(option.value))
    : GENDER_OPTIONS;

  return (
    <View style={[styles.container, compact && styles.containerCompact]}>
      <Text style={[styles.label, compact && styles.labelCompact]}>{label}</Text>
      <View
        accessibilityRole="radiogroup"
        style={[styles.options, compact && styles.optionsCompact]}
      >
        {displayedOptions.map((option) => {
          const isSelected = value === option.value;

          return (
            <TouchableOpacity
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: isSelected }}
              activeOpacity={0.8}
              onPress={() => onChange(option.value)}
              style={[
                styles.option,
                compact && styles.optionCompact,
                isSelected && styles.optionSelected,
              ]}
            >
              {!compact && (
                <View style={[styles.radio, isSelected && styles.radioSelected]}>
                  {isSelected && <View style={styles.radioDot} />}
                </View>
              )}
              <Text style={[styles.optionLabel, isSelected && styles.optionLabelSelected]}>
                {compact ? option.compactLabel ?? option.label : option.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.sm,
  },
  containerCompact: {
    gap: 6,
  },
  label: {
    color: Colors.gray[700],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
  },
  labelCompact: {
    color: Colors.gray[800],
  },
  options: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  optionsCompact: {
    gap: 6,
  },
  option: {
    minWidth: '46%',
    flexGrow: 1,
    flexBasis: 0,
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.white,
  },
  optionCompact: {
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  optionSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '0D',
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
  },
  optionLabel: {
    flexShrink: 1,
    color: Colors.gray[600],
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.medium,
  },
  optionLabelSelected: {
    color: Colors.primaryDark,
    fontWeight: FontWeights.semibold,
  },
});
