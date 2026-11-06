import type { TripRequestVehicleType } from '@/types';
import { useEffect, useState } from 'react';
import { useRequestVehicleOptions } from './useRequestVehicleOptions';

type Props = Parameters<typeof useRequestVehicleOptions>[0] & {
  requestId?: string;
  initialBudget?: number | null;
  vehicleType: TripRequestVehicleType;
};

/** Estimates inform editing; only the user may change the stored budget. */
export function useEditRequestPricing({ requestId, initialBudget, vehicleType, ...options }: Props) {
  const quote = useRequestVehicleOptions(options);
  const budgetKey = requestId ?? '';
  const [manualBudget, setManualBudget] = useState<{ key: string; value: string } | null>(null);
  useEffect(() => {
    setManualBudget((current) => current?.key === budgetKey ? current : null);
  }, [budgetKey]);
  const hasEditedBudget = manualBudget?.key === budgetKey;
  const selectedOption = quote.vehicleOptions.find((option) => option.vehicleType === vehicleType);
  const recommendation = selectedOption?.recommendedPricePerSeat;
  const savedBudget = initialBudget != null && Number.isFinite(Number(initialBudget)) && Number(initialBudget) > 0
    ? String(initialBudget) : '';
  // Route, seats, vehicles and delayed network estimates must never overwrite
  // the passenger's price. A missing legacy budget requires an explicit entry.
  const maxPricePerSeat = hasEditedBudget
    ? manualBudget.value
    : savedBudget;
  const confirmedPricePerSeat = maxPricePerSeat.trim() ? Number(maxPricePerSeat) : undefined;

  return {
    ...quote,
    maxPricePerSeat,
    confirmedPricePerSeat,
    hasEditedBudget,
    recommendedPricePerSeat: recommendation,
    isBudgetValid: confirmedPricePerSeat !== undefined
      && Number.isFinite(confirmedPricePerSeat) && confirmedPricePerSeat > 0,
    setMaxPricePerSeat: (value: string) => setManualBudget({ key: budgetKey, value }),
    resetBudget: () => setManualBudget({ key: budgetKey, value: savedBudget }),
  };
}
