import type { TripRequestVehicleType } from '@/types';
import { useEffect, useState } from 'react';
import { useRequestVehicleOptions } from './useRequestVehicleOptions';

type Props = Parameters<typeof useRequestVehicleOptions>[0] & {
  requestId?: string;
  vehicleType: TripRequestVehicleType;
};

/** Re-estimate the edited route before confirmation, never the accepted trip. */
export function useEditRequestPricing({ requestId, vehicleType, ...options }: Props) {
  const quote = useRequestVehicleOptions(options);
  const budgetKey = JSON.stringify([requestId, quote.pricingKey, vehicleType]);
  const [manualBudget, setManualBudget] = useState<{ key: string; value: string } | null>(null);
  useEffect(() => {
    setManualBudget((current) => current?.key === budgetKey ? current : null);
  }, [budgetKey]);
  const hasEditedBudget = manualBudget?.key === budgetKey;
  const selectedOption = quote.vehicleOptions.find((option) => option.vehicleType === vehicleType);
  const recommendation = selectedOption?.recommendedPricePerSeat;
  const hasRecommendation = typeof recommendation === 'number'
    && Number.isFinite(recommendation) && recommendation > 0;

  // A manual budget belongs to one route/vehicle/seat configuration. Invalidate
  // it on change, but preserve typing when a quote arrives for the same route.
  const maxPricePerSeat = hasEditedBudget
    ? manualBudget.value
    : !quote.isPriceLoading && !quote.isVehicleOptionsError && hasRecommendation
      ? String(recommendation)
      : '';
  const confirmedPricePerSeat = maxPricePerSeat.trim() ? Number(maxPricePerSeat) : undefined;

  return {
    ...quote,
    maxPricePerSeat,
    confirmedPricePerSeat,
    hasEditedBudget,
    isBudgetValid: confirmedPricePerSeat !== undefined
      && Number.isFinite(confirmedPricePerSeat) && confirmedPricePerSeat > 0,
    setMaxPricePerSeat: (value: string) => setManualBudget({ key: budgetKey, value }),
    resetBudget: () => setManualBudget(null),
  };
}
