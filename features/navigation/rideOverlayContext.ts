import { createContext } from 'react';
import type { RideOverlayStore } from './rideOverlayStore';

export const RideOverlayContext = createContext<RideOverlayStore | null>(null);
export const RideOverlayScopeContext = createContext<{ key: string; active: boolean } | null>(null);
