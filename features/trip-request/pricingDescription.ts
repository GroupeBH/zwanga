import type { TripRequestPricing } from '@/store/api/trip-request/contracts';
import { formatCdfPrice } from './requestFormModel';

/** Describe the server quote without recomputing or multiplying its total. */
export function requestPricingDescription(pricing?: TripRequestPricing): string | null {
  if (!pricing) return null;
  const conditions = [pricing.heavyTraffic ? 'trafic lourd' : '', pricing.heavyRain ? 'forte pluie' : '']
    .filter(Boolean).join(' et ');
  const delay = pricing.billableDelaySeconds > 0
    ? ` + ${formatCdfPrice(pricing.trafficDelaySurchargePerSeat)} de retard estimé` : '';
  return `${formatCdfPrice(pricing.pricePerKmPerPassenger)}/km${conditions ? ` (${conditions})` : ''}${delay} · minimum ${formatCdfPrice(pricing.minimumPricePerSeat)}/place${pricing.distanceSource === 'straight_line' ? ' · distance approximative' : ''}${!pricing.trafficDataAvailable ? ' · trafic indisponible' : ''}`;
}
