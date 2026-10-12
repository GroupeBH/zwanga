import { useCallback, useEffect, useRef, useState } from 'react';
import type { HomeSheetMode } from '@/features/home/homeTypes';
import type { useHomeContext } from './useHomeContext';

type Props = Pick<ReturnType<typeof useHomeContext>, 'currentUser' | 'isDriver'>;

/** One selection for the sheet, map and discovery reads; never shared across accounts. */
export function useHomeDiscoveryMode({ currentUser, isDriver }: Props) {
  const userId = currentUser?.id ?? null;
  const [selection, setSelection] = useState<{
    userId: string | null; isDriver: boolean; mode: HomeSheetMode;
  } | null>(null);
  const current = useRef({ userId, isDriver });
  current.current = { userId, isDriver };
  useEffect(() => { setSelection(null); }, [userId, isDriver]);

  const isRequestsSheetMode = isDriver && (!selection || selection.userId !== userId
    || selection.isDriver !== isDriver || selection.mode === 'requests');
  const setHomeSheetMode = useCallback((mode: HomeSheetMode) => {
    if (!isDriver || current.current.userId !== userId || current.current.isDriver !== isDriver) return;
    setSelection(previous => previous?.userId === userId && previous.isDriver === isDriver && previous.mode === mode
      ? previous : { userId, isDriver, mode });
  }, [userId, isDriver]);

  return { isRequestsSheetMode, setHomeSheetMode };
}
