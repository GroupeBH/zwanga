

export type PassengerTrackingSession = {
  bookingId: string;
  tripId?: string | null;
  waitForActiveTrip: boolean;
};

export type PassengerTrackingReadiness = 'active' | 'waiting' | 'terminal';
