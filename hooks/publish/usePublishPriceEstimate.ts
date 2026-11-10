import type { Dispatch, SetStateAction } from 'react';
import type { TripRequestVehicleType } from '@/types';
import { useRequestVehicleOptions } from '@/hooks/trip-request/useRequestVehicleOptions';
import { useDisplayReadsEnabled } from '@/hooks/useDisplayReads';
import { requestPricingDescription } from '@/features/trip-request/pricingDescription';

type Props = Parameters<typeof useRequestVehicleOptions>[0] & {
  vehicleType: TripRequestVehicleType | null | undefined;
  price: string;
  hasEditedPrice: boolean;
  setPrice: Dispatch<SetStateAction<string>>;
  setHasEditedPrice: Dispatch<SetStateAction<boolean>>;
};

/** Published trips keep their existing per-seat contract. The quote is advice,
 * never a total divided locally or a late overwrite of the driver's input. */
export function usePublishPriceEstimate(props: Props) {
  const enabled = useDisplayReadsEnabled(Boolean(props.enabled && props.vehicleType));
  const quote = useRequestVehicleOptions({ ...props, enabled });
  const option = quote.vehicleOptions.find(item => item.vehicleType === props.vehicleType);
  const amount = option?.recommendedPricePerSeat;
  const recommendation = enabled && !quote.isPriceLoading && !quote.isVehicleOptionsError &&
    option?.availableForRequestedSeats === true && typeof amount === 'number' &&
    Number.isFinite(amount) && amount > 0 && amount <= Number.MAX_SAFE_INTEGER ? amount : null;
  const price = props.hasEditedPrice ? props.price : recommendation === null ? '' : String(recommendation);
  const setPrice: Dispatch<SetStateAction<string>> = next => {
    props.setHasEditedPrice(true);
    props.setPrice(typeof next === 'function' ? next(price) : next);
  };
  return { price, setPrice, recommendation, description: requestPricingDescription(quote.pricing), loading: quote.isPriceLoading,
    retry: quote.retryVehicleOptions,
    useEstimate: () => {
      if (recommendation === null) return;
      props.setPrice(''); props.setHasEditedPrice(false);
    } };
}
