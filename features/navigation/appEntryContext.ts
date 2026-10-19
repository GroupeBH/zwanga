import { createContext, useContext } from 'react';

/** Short visual entry gate only, not the lifetime of background verification. */
export const AppEntryContext = createContext(false);
export const useAppEntryPending = () => useContext(AppEntryContext);
