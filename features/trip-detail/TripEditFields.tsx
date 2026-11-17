import React from 'react';
import { Platform, ScrollView } from 'react-native';
import { TripEditorRouteFields, type TripEditorRouteFieldsProps } from '@/features/trips/TripEditorRouteFields';
import { TripEditorDetailsFields, type TripEditorDetailsProps } from '@/features/trips/TripEditorDetailsFields';
import { tripEditorStyles as s } from '@/features/trips/tripEditorStyles';

export interface TripEditFieldsProps extends TripEditorRouteFieldsProps, TripEditorDetailsProps {
  editModalBottomPadding: number;
  // Retained for existing validation/controllers; the editor no longer hides fields behind steps.
  editStep: 1 | 2;
  scrollRef?: React.RefObject<ScrollView | null>;
}

export function TripEditFields(props: TripEditFieldsProps) {
  return <ScrollView ref={props.scrollRef} testID="trip-edit-content"
    showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled"
    keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
    automaticallyAdjustKeyboardInsets={false} automaticallyAdjustContentInsets={false}
    contentInsetAdjustmentBehavior="never"
    style={[s.scroll, Platform.OS === 'ios' && s.scrollIos]} contentContainerStyle={s.content}
    scrollIndicatorInsets={{ bottom: props.editModalBottomPadding }}>
    <TripEditorRouteFields {...props} />
    <TripEditorDetailsFields {...props} />
  </ScrollView>;
}
