import { Colors } from '@/constants/styles';
import { styles } from '@/features/profile/ProfileSubscriptionModal.styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { SubscriptionPaymentProgressStep } from './profileModel';

interface ProfileSubscriptionProgressProps {
  subscriptionPaymentProgressSteps: SubscriptionPaymentProgressStep[];
}

export function ProfileSubscriptionProgress({
  subscriptionPaymentProgressSteps,
}: ProfileSubscriptionProgressProps) {
  return (
    <View style={styles.subscriptionProgressPanel}>
      {subscriptionPaymentProgressSteps.map((step, index) => {
        const isLast = index === subscriptionPaymentProgressSteps.length - 1;
        const progressColor =
          step.status === 'done'
            ? Colors.success
            : step.status === 'error'
              ? Colors.danger
              : step.status === 'paused'
                ? Colors.warningDark
                : step.status === 'current'
                  ? Colors.primary
                  : Colors.gray[300];
        const iconName =
          step.status === 'done' ? 'checkmark' : step.status === 'error' ? 'close' : step.icon;

        return (
          <View key={step.key} style={styles.subscriptionProgressRow}>
            <View style={styles.subscriptionProgressRail}>
              <View
                style={[
                  styles.subscriptionProgressDot,
                  {
                    backgroundColor: step.status === 'waiting' ? Colors.white : progressColor,
                    borderColor: progressColor,
                  },
                ]}
              >
                {step.status === 'current' ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Ionicons
                    name={iconName}
                    size={13}
                    color={step.status === 'waiting' ? Colors.gray[400] : Colors.white}
                  />
                )}
              </View>
              {!isLast ? (
                <View
                  style={[
                    styles.subscriptionProgressLine,
                    {
                      backgroundColor:
                        step.status === 'done' ? Colors.success + '80' : Colors.gray[200],
                    },
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.subscriptionProgressTextBlock}>
              <Text
                style={[
                  styles.subscriptionProgressTitle,
                  step.status !== 'waiting' && {
                    color: Colors.gray[900],
                  },
                ]}
              >
                {step.title}
              </Text>
              <Text style={styles.subscriptionProgressDescription}>{step.description}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
