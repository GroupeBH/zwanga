import { PublishStep } from './publishModel';
import { styles } from '../screen-styles/app/publish/index';
import { Colors } from '@/constants/styles';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';

interface PublishStepIndicatorProps {
  isStepActive: (checkStep: PublishStep) => boolean;
  isStepCompleted: (checkStep: PublishStep) => boolean;
}

export function PublishStepIndicator({
  isStepActive,
  isStepCompleted,
}: PublishStepIndicatorProps) {
  return (
    <View style={styles.stepIndicatorContainer}>
      <View style={styles.stepIndicatorRow}>
        {/* Route */}
        <View style={[
          styles.stepDot,
          isStepActive('route') && styles.stepDotActive,
          isStepCompleted('route') && styles.stepDotCompleted
        ]}>
          <Ionicons 
            name={isStepCompleted('route') ? "checkmark" : "map"} 
            size={14} 
            color={Colors.white} 
          />
        </View>
        <View style={[styles.stepLine, isStepCompleted('datetime') && styles.stepLineActive]} />
        
        {/* DateTime */}
        <View style={[
          styles.stepDot,
          isStepActive('datetime') && styles.stepDotActive,
          isStepCompleted('datetime') && styles.stepDotCompleted
        ]}>
          <Ionicons 
            name={isStepCompleted('datetime') ? "checkmark" : "time"} 
            size={14} 
            color={isStepActive('datetime') || isStepCompleted('datetime') ? Colors.white : Colors.gray[400]} 
          />
        </View>
        <View style={[styles.stepLine, isStepCompleted('vehicle') && styles.stepLineActive]} />
        
        {/* Vehicle */}
        <View style={[
          styles.stepDot,
          isStepActive('vehicle') && styles.stepDotActive,
          isStepCompleted('vehicle') && styles.stepDotCompleted
        ]}>
          <Ionicons 
            name={isStepCompleted('vehicle') ? "checkmark" : "car"} 
            size={14} 
            color={isStepActive('vehicle') || isStepCompleted('vehicle') ? Colors.white : Colors.gray[400]} 
          />
        </View>
        <View style={[styles.stepLine, isStepCompleted('pricing') && styles.stepLineActive]} />
        
        {/* Pricing */}
        <View style={[
          styles.stepDot,
          isStepActive('pricing') && styles.stepDotActive,
          isStepCompleted('pricing') && styles.stepDotCompleted
        ]}>
          <Ionicons 
            name={isStepCompleted('pricing') ? "checkmark" : "cash"} 
            size={14} 
            color={isStepActive('pricing') || isStepCompleted('pricing') ? Colors.white : Colors.gray[400]} 
          />
        </View>
        <View style={[styles.stepLine, isStepCompleted('confirm') && styles.stepLineActive]} />
        
        {/* Confirm */}
        <View style={[
          styles.stepDot,
          isStepActive('confirm') && styles.stepDotActive
        ]}>
          <Ionicons 
            name="checkmark-done" 
            size={14} 
            color={isStepActive('confirm') ? Colors.white : Colors.gray[400]} 
          />
        </View>
      </View>
      <View style={styles.stepLabelRow}>
        <Text style={[styles.stepLabel, isStepActive('route') && styles.stepLabelActive]}>Route</Text>
        <Text style={[styles.stepLabel, isStepActive('datetime') && styles.stepLabelActive]}>Date</Text>
        <Text style={[styles.stepLabel, isStepActive('vehicle') && styles.stepLabelActive]}>Véhicule</Text>
        <Text style={[styles.stepLabel, isStepActive('pricing') && styles.stepLabelActive]}>Détails</Text>
        <Text style={[styles.stepLabel, isStepActive('confirm') && styles.stepLabelActive]}>Confirmer</Text>
      </View>
    </View>
  );
}
