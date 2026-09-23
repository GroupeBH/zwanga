import type { PickupNoticeEventType } from './navigationModel';

export const PICKUP_NOTICE_PRIORITY: Record<PickupNoticeEventType, number> = {
  driver_arrived_pickup: 1,
  parties_nearby: 2,
  passenger_ready_pickup: 3,
};
