import { getNavigationContacts, isNavigationParticipant, type NavigationContactContext } from '@/features/navigation/navigationContacts';
import { useAppSelector } from '@/store/hooks';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function useNavigationAssistance({ isScreenActive, ...context }: Omit<NavigationContactContext, 'userId'> & { isScreenActive: boolean }) {
  const userId = useAppSelector(state => state.auth.user?.id);
  const [panel, setPanel] = useState<'contacts' | 'sos' | null>(null);
  const [contactId, setContactId] = useState<string | null>(null);
  const { role, trip, booking, bookings } = context;
  const enabled = isScreenActive && isNavigationParticipant({ role, trip, booking, userId });
  useEffect(() => { setPanel(null); setContactId(null); }, [isScreenActive, role, trip?.id, booking?.id, userId]);
  const contacts = useMemo(() => panel === 'contacts'
    ? getNavigationContacts({ role, trip, booking, bookings, userId }).filter(person => !contactId || person.id === contactId)
    : [], [panel, role, trip, booking, bookings, userId, contactId]);
  const openContacts = useCallback(() => { if (enabled) { setContactId(null); setPanel('contacts'); } }, [enabled]);
  const openContact = useCallback((passengerId: string) => {
    if (enabled) { setContactId(passengerId); setPanel('contacts'); }
  }, [enabled]);
  const openSos = useCallback(() => { if (enabled) setPanel('sos'); }, [enabled]);
  const close = useCallback(() => setPanel(null), []);
  return { panel: enabled ? panel : null, isOpen: enabled && panel !== null, enabled, contacts, openContacts, openContact, openSos, close };
}
