import { useContext } from 'react';
import { HomeEntryStatusContext } from '@/features/navigation/homeEntryStatusContext';
import { EntrySyncBanner } from './EntrySyncBanner';

export function HomeEntryStatus() {
  const status = useContext(HomeEntryStatusContext);
  return status ? <EntrySyncBanner {...status} /> : null;
}
