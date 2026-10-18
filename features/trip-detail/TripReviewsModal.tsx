import React from 'react';
import { ProfileReviewsModal } from '@/components/profile/ProfileReviewsModal';
import type { Review, Trip } from '@/types';
import type { EdgeInsets } from 'react-native-safe-area-context';

interface Props {
  reviewsModalVisible: boolean;
  setReviewsModalVisible: React.Dispatch<React.SetStateAction<boolean>>;
  insets: EdgeInsets;
  trip: Trip | undefined;
  driverReviewCount: number;
  driverReviews: Review[] | undefined;
}

export function TripReviewsModal({ trip, ...props }: Props) {
  return <ProfileReviewsModal {...props} userId={trip?.driverId} />;
}
