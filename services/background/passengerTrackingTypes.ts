

export type PassengerTrackingSession = {
  bookingId: string;
  tripId?: string | null;
  waitForActiveTrip: boolean;
  departureTimeMs?: number | null;
};

export type PassengerTrackingReadiness = 'active' | 'waiting' | 'terminal';
