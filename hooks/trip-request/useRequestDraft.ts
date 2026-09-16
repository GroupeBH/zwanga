import { buildPresetWindow } from '@/features/trip-request/requestFormModel';
import type { RootState } from '@/store';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import {
  changeRequestDraft,
  createRequestDraft,
  discardRequestDraft,
  initializeRequestDraft,
  type RequestDraft,
  type RequestDraftChange
} from '@/store/slices/requestDraftsSlice';
import { useCallback, useEffect, useId, useMemo, useState, type SetStateAction } from 'react';
import { useStore } from 'react-redux';

/** One serializable, isolated Redux draft per mounted form. No cross-screen draft leakage. */
export function useRequestDraft() {
  const id = useId();
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const [initialDraft] = useState(() => {
    const window = buildPresetWindow('now');
    return createRequestDraft(window.min.getTime(), window.flex);
  });
  const draft = useAppSelector((state) => state.requestDrafts.byId[id] ?? initialDraft);
  useEffect(() => {
    dispatch(initializeRequestDraft({ id, draft: initialDraft }));
    return () => { dispatch(discardRequestDraft(id)); };
  }, [dispatch, id, initialDraft]);

  const setters = useMemo(() => {
    const setter = <K extends keyof RequestDraft>(field: K) => (next: SetStateAction<RequestDraft[K]>) => {
      const current = store.getState().requestDrafts.byId[id];
      if (!current) return;
      const value = typeof next === 'function' ? (next as (value: RequestDraft[K]) => RequestDraft[K])(current[field]) : next;
      dispatch(changeRequestDraft({ id, change: { field, value } as RequestDraftChange }));
    };
    return {
      setDepartureLocation: setter('departureLocation'), setArrivalLocation: setter('arrivalLocation'),
      setDepartureManualAddress: setter('departureManualAddress'), setArrivalManualAddress: setter('arrivalManualAddress'),
      setDepartureReference: setter('departureReference'), setArrivalReference: setter('arrivalReference'),
      setTimePreset: setter('timePreset'), setDepartureDateMinMs: setter('departureDateMinMs'),
      setFlexibilityMinutes: setter('flexibilityMinutes'), setNumberOfSeats: setter('numberOfSeats'),
      setHasSpecifiedNumberOfSeats: setter('hasSpecifiedNumberOfSeats'), setSelectedVehicleType: setter('selectedVehicleType'),
      setMaxPricePerSeat: setter('maxPricePerSeat'), setHasEditedBudget: setter('hasEditedBudget'),
      setRequestPaymentMode: setter('requestPaymentMode'), setDescription: setter('description'),
    };
  }, [dispatch, id, store]);

  const departureDateMin = useMemo(() => new Date(draft.departureDateMinMs), [draft.departureDateMinMs]);
  const setDepartureDateMin = useCallback((next: SetStateAction<Date>) => {
    setters.setDepartureDateMinMs((current) => (typeof next === 'function' ? next(new Date(current)) : next).getTime());
  }, [setters]);

  return { ...draft, ...setters, departureDateMin, setDepartureDateMin };
}
