import { BorderRadius, Colors, FontSizes, FontWeights, Spacing } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React, { ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type AddressSectionStep = 'method' | 'departure' | 'arrival';

type AddressSectionSliderProps = {
  activeStep: AddressSectionStep;
  completedSteps: Partial<Record<AddressSectionStep, boolean>>;
  children: ReactNode;
  nextDisabled?: boolean;
  nextLabel?: string;
  onBack: () => void;
  onNext: () => void;
  onStepChange: (step: AddressSectionStep) => void;
  canOpenStep?: (step: AddressSectionStep) => boolean;
};

const STEPS: { id: AddressSectionStep; label: string }[] = [
  { id: 'method', label: 'Méthode' },
  { id: 'departure', label: 'Départ' },
  { id: 'arrival', label: 'Arrivée' },
];

export default function AddressSectionSlider({
  activeStep,
  completedSteps,
  children,
  nextDisabled = false,
  nextLabel,
  onBack,
  onNext,
  onStepChange,
  canOpenStep,
}: AddressSectionSliderProps) {
  const activeIndex = STEPS.findIndex((step) => step.id === activeStep);
  const isLastStep = activeStep === 'arrival';
  const isFirstStep = activeStep === 'method';
  const resolvedNextLabel =
    nextLabel ?? (activeStep === 'method' ? 'Choisir le départ' : 'Choisir l’arrivée');

  return (
    <View style={styles.container}>
      <View style={styles.progressRow}>
        {STEPS.map((step, index) => {
          const active = step.id === activeStep;
          const complete = Boolean(completedSteps[step.id]);
          const allowed = canOpenStep ? canOpenStep(step.id) : true;

          return (
            <React.Fragment key={step.id}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: !allowed }}
                activeOpacity={0.85}
                disabled={!allowed}
                style={[styles.stepPill, active && styles.stepPillActive, !allowed && styles.stepPillDisabled]}
                onPress={() => onStepChange(step.id)}
              >
                <View style={[styles.stepNumber, (active || complete) && styles.stepNumberActive]}>
                  {complete ? (
                    <Ionicons name="checkmark" size={12} color={Colors.white} />
                  ) : (
                    <Text style={[styles.stepNumberText, active && styles.stepNumberTextActive]}>
                      {index + 1}
                    </Text>
                  )}
                </View>
                <Text style={[styles.stepLabel, active && styles.stepLabelActive]}>{step.label}</Text>
              </TouchableOpacity>
              {index < STEPS.length - 1 && (
                <View style={[styles.progressLine, index < activeIndex && styles.progressLineActive]} />
              )}
            </React.Fragment>
          );
        })}
      </View>

      <View style={styles.panel}>{children}</View>

      <View style={styles.actions}>
        {!isFirstStep ? (
          <TouchableOpacity style={styles.secondaryButton} onPress={onBack} activeOpacity={0.9}>
            <Ionicons name="arrow-back" size={16} color={Colors.gray[700]} />
            <Text style={styles.secondaryButtonText}>Retour</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.actionSpacer} />
        )}

        {!isLastStep ? (
          <TouchableOpacity
            style={[styles.primaryButton, nextDisabled && styles.primaryButtonDisabled]}
            onPress={onNext}
            disabled={nextDisabled}
            activeOpacity={0.9}
          >
            <Text style={styles.primaryButtonText}>{resolvedNextLabel}</Text>
            <Ionicons name="arrow-forward" size={16} color={Colors.white} />
          </TouchableOpacity>
        ) : (
          <View style={styles.readyPill}>
            <Ionicons
              name={completedSteps.arrival ? 'checkmark-circle' : 'ellipse-outline'}
              size={16}
              color={completedSteps.arrival ? Colors.success : Colors.gray[500]}
            />
            <Text style={styles.readyPillText}>
              {completedSteps.arrival ? 'Itinéraire prêt' : 'Ajoutez l’arrivée'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepPill: {
    minHeight: 36,
    borderRadius: BorderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    backgroundColor: Colors.gray[50],
  },
  stepPillActive: {
    backgroundColor: Colors.primary + '10',
  },
  stepPillDisabled: {
    opacity: 0.5,
  },
  stepNumber: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.gray[200],
  },
  stepNumberActive: {
    backgroundColor: Colors.primary,
  },
  stepNumberText: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.gray[600],
  },
  stepNumberTextActive: {
    color: Colors.white,
  },
  stepLabel: {
    fontSize: FontSizes.xs,
    fontWeight: FontWeights.bold,
    color: Colors.gray[600],
  },
  stepLabelActive: {
    color: Colors.primary,
  },
  progressLine: {
    flex: 1,
    height: 1,
    backgroundColor: Colors.gray[200],
  },
  progressLineActive: {
    backgroundColor: Colors.primary,
  },
  panel: {
    minHeight: 210,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  actionSpacer: {
    flex: 1,
  },
  secondaryButton: {
    minHeight: 44,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  secondaryButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
  primaryButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  primaryButtonDisabled: {
    backgroundColor: Colors.gray[300],
  },
  primaryButtonText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.bold,
    color: Colors.white,
  },
  readyPill: {
    flex: 1,
    minHeight: 44,
    borderRadius: BorderRadius.sm,
    backgroundColor: Colors.gray[50],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  readyPillText: {
    fontSize: FontSizes.sm,
    fontWeight: FontWeights.semibold,
    color: Colors.gray[700],
  },
});
