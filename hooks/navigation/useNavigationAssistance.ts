import { getNavigationContacts, isNavigationParticipant, type NavigationContactContext } from '@/features/navigation/navigationContacts';
import { useAppSelector } from '@/store/hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function useNavigationAssistance({ isScreenActive, ...context }: Omit<NavigationContactContext, 'userId'> & { isScreenActive: boolean }) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const [panel, setPanel] = useState<'contacts' | 'sos' | null>(null);
  const { role, trip, booking, bookings } = context;
  const enabled = isScreenActive && isNavigationParticipant({ role, trip, booking, userId });
  useEffect(() => { setPanel(null); }, [isScreenActive, role, trip?.id, booking?.id, userId]);
  const contacts = useMemo(() => panel === 'contacts'
    ? getNavigationContacts({ role, trip, booking, bookings, userId }) : [], [panel, role, trip, booking, bookings, userId]);
  const openContacts = useCallback(() => { if (enabled) setPanel('contacts'); }, [enabled]);
  const openSos = useCallback(() => { if (enabled) setPanel('sos'); }, [enabled]);
  const close = useCallback(() => setPanel(null), []);
  return { panel: enabled ? panel : null, isOpen: enabled && panel !== null, enabled, contacts, openContacts, openSos, close };
}
