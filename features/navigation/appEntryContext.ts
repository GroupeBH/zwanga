import { createContext, useContext } from 'react';

/** Shared entry decision; keeps Home work idle behind the single global loader. */
export const AppEntryContext = createContext(false);
export const useAppEntryPending = () => useContext(AppEntryContext);
