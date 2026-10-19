import { createContext } from 'react';

export type HomeEntryStatusValue = {
  failed: boolean; offline: boolean; actionLabel?: string; onAction: () => void;
} | null;

/** Inline Home status: never overlays the native map or a priority card. */
export const HomeEntryStatusContext = createContext<HomeEntryStatusValue>(null);
