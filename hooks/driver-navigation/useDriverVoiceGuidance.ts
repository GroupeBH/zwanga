import {
  cleanHtmlInstructions,
  formatDistanceForSpeech,
} from '../../features/driver-navigation/navigationPresentation';
import {
  RouteStep,
  Waypoint,
  SPEECH_LANGUAGE,
  SPEECH_RATE,
  SPEECH_MIN_INTERVAL_MS,
} from '../../features/driver-navigation/navigationModel';
import { NavigationSpeech as Speech } from '@/utils/navigationSpeech';
import React, { useCallback, useEffect } from 'react';

interface Params {
  isMountedRef: React.RefObject<boolean>;
  isTripOngoingRef: React.RefObject<boolean>;
  isVoiceGuidanceEnabledRef: React.RefObject<boolean>;
  lastSpeechAtRef: React.RefObject<number>;
  waypointModalVisible: boolean;
  activeWaypoint: Waypoint | null;
  announcedWaypointIdsRef: React.RefObject<Set<string>>;
  spokenInstructionKeysRef: React.RefObject<Set<string>>;
  setIsVoiceGuidanceEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  steps: RouteStep[];
  currentStepIndex: number;
  isTripOngoing: boolean;
  isLoadingRoute: boolean;
}

export function useDriverVoiceGuidance({
  isMountedRef,
  isTripOngoingRef,
  isVoiceGuidanceEnabledRef,
  lastSpeechAtRef,
  waypointModalVisible,
  activeWaypoint,
  announcedWaypointIdsRef,
  spokenInstructionKeysRef,
  setIsVoiceGuidanceEnabled,
  steps,
  currentStepIndex,
  isTripOngoing,
  isLoadingRoute,
}: Params) {
  const speakNavigationMessage = useCallback(async (message: string, options: { force?: boolean } = {}) => {
    const text = message.replace(/\s+/g, ' ').trim();
    if (!text || !isMountedRef.current || !isTripOngoingRef.current || !isVoiceGuidanceEnabledRef.current) {
      return;
    }

    const now = Date.now();
    if (!options.force && now - lastSpeechAtRef.current < SPEECH_MIN_INTERVAL_MS) {
      return;
    }
    lastSpeechAtRef.current = now;

    try {
      if (await Speech.isSpeakingAsync()) {
        await Speech.stop();
      }

      if (!isMountedRef.current || !isTripOngoingRef.current || !isVoiceGuidanceEnabledRef.current) {
        return;
      }

      Speech.speak(text, {
        language: SPEECH_LANGUAGE,
        rate: SPEECH_RATE,
        pitch: 1,
        onError: (error) => {
          console.warn('[Navigation] Guidage vocal impossible:', error);
        },
      });
    } catch (error) {
      console.warn('[Navigation] Guidage vocal indisponible:', error);
    }
  }, []);

  const buildInstructionSpeech = useCallback((step: RouteStep, intro?: string) => {
    const instruction = cleanHtmlInstructions(step.html_instructions);
    if (!instruction) return '';

    const distance = formatDistanceForSpeech(step.distance.value);
    const instructionText = distance ? `Dans ${distance}, ${instruction}.` : `${instruction}.`;
    return [intro, instructionText].filter(Boolean).join(' ');
  }, []);

  const buildWaypointSpeech = useCallback((waypoint: Waypoint) => {
    const passengerName = waypoint.passenger.name || 'le passager';
    const address = waypoint.address ? ` Adresse: ${waypoint.address}.` : '';
    if (waypoint.type === 'pickup') {
      return `Vous \u00eates arriv\u00e9 au point de r\u00e9cup\u00e9ration de ${passengerName}.${address}`;
    }

    return `Nous sommes arriv\u00e9s au point de destination de ${passengerName}. La d\u00e9pose se confirme automatiquement.${address}`;
  }, []);

  useEffect(() => {
    if (
      !waypointModalVisible ||
      !activeWaypoint ||
      announcedWaypointIdsRef.current.has(activeWaypoint.id)
    ) {
      return;
    }

    announcedWaypointIdsRef.current.add(activeWaypoint.id);
    void speakNavigationMessage(buildWaypointSpeech(activeWaypoint), { force: true });
  }, [activeWaypoint, buildWaypointSpeech, speakNavigationMessage, waypointModalVisible]);

  const announceInstruction = useCallback((step: RouteStep, index: number, intro?: string) => {
    const instruction = cleanHtmlInstructions(step.html_instructions);
    if (!instruction) return;

    const speechKey = `${index}:${instruction}`;
    if (spokenInstructionKeysRef.current.has(speechKey)) {
      return;
    }

    spokenInstructionKeysRef.current.add(speechKey);
    void speakNavigationMessage(buildInstructionSpeech(step, intro));
  }, [buildInstructionSpeech, speakNavigationMessage]);

  const toggleVoiceGuidance = useCallback(() => {
    const nextValue = !isVoiceGuidanceEnabledRef.current;
    isVoiceGuidanceEnabledRef.current = nextValue;
    setIsVoiceGuidanceEnabled(nextValue);

    if (!nextValue) {
      void Speech.stop();
      return;
    }

    const currentStep = steps[currentStepIndex];
    const message = currentStep
      ? buildInstructionSpeech(currentStep, 'Guidage vocal activé.')
      : 'Guidage vocal activé.';
    void speakNavigationMessage(message, { force: true });
  }, [buildInstructionSpeech, currentStepIndex, speakNavigationMessage, steps]);

  useEffect(() => {
    spokenInstructionKeysRef.current.clear();
  }, [steps]);

  useEffect(() => {
    if (!isTripOngoing || isLoadingRoute) {
      return;
    }

    const currentStep = steps[currentStepIndex];
    if (!currentStep) {
      return;
    }

    announceInstruction(
      currentStep,
      currentStepIndex,
      currentStepIndex === 0 ? 'Navigation démarrée.' : 'Prochaine instruction.'
    );
  }, [announceInstruction, currentStepIndex, isLoadingRoute, isTripOngoing, steps]);

  return {
    speakNavigationMessage,
    buildInstructionSpeech,
    buildWaypointSpeech,
    toggleVoiceGuidance,
  };
}
