import { Colors } from '@/constants/styles';
import { requestStyles as styles } from '@/features/trip-request/requestStyles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View
} from 'react-native';

import type { RequestTripController } from '@/hooks/trip-request/useRequestTripController';

type Props = Pick<RequestTripController, 'handlePrimaryAction' | 'primaryButtonDisabled' | 'primaryIconName' | 'primaryLabel'> & { compact?: boolean };
export function RequestPrimaryButton({ compact = false, handlePrimaryAction, primaryButtonDisabled, primaryIconName, primaryLabel }: Props) {
  return (
    <TouchableOpacity
      style={[styles.mainButtonWrap, compact && styles.mainButtonWrapCompact]}
      onPress={handlePrimaryAction}
      disabled={primaryButtonDisabled}
      activeOpacity={0.9}
    >
      <View
        style={[styles.mainButton, compact && styles.mainButtonCompact, primaryButtonDisabled && styles.mainButtonDisabled]}
      >
        {primaryButtonDisabled ? (
          <ActivityIndicator color={Colors.white} />
        ) : (
          <>
            <Text style={styles.mainButtonText}>{primaryLabel}</Text>
            <Ionicons name={primaryIconName} size={18} color={Colors.white} />
          </>
        )}
      </View>
    </TouchableOpacity>
  );
}
