// Keep these awareness and sampling values aligned with the backend ride-progress contract.
// Automatic boarding confirmation remains server-authoritative.
export const DRIVER_NEAR_PICKUP_DISTANCE_KM = 0.2;
export const DRIVER_PICKUP_ARRIVAL_DISTANCE_KM = 0.08;
export const PASSENGER_READY_DISTANCE_KM = 0.005;

export const DRIVER_LOCATION_BACKEND_UPDATE_INTERVAL_MS = 3000;
export const PASSENGER_LOCATION_SEND_INTERVAL_MS = 5000;
export const ACTIVE_RIDE_BACKGROUND_SEND_INTERVAL_MS = 5000;
export const ACTIVE_RIDE_BACKGROUND_DISTANCE_INTERVAL_METERS = 0;
export const BOARDING_LOCATION_MAX_AGE_MS = 10_000;
export const BOARDING_MAX_ACCEPTED_GPS_ACCURACY_METERS = 70;
// The backend expires a boarding sample after 10 seconds. Keep stationary updates enabled so a
// passenger waiting at the pickup point does not disappear from the detection window.
export const PASSENGER_LOCATION_DISTANCE_INTERVAL_METERS = 0;
