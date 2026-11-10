import { createContext } from 'react';
import type { RideOverlayStore } from './rideOverlayStore';

export const RideOverlayContext = createContext<RideOverlayStore | null>(null);
export const RideOverlayScopeContext = createContext<{ key: string; active: boolean } | null>(null);
// Native Modal content is mounted by RN when visible. The overlay host explicitly
// hides suspended panels while keeping their state mounted.
export const RideOverlayVisibilityContext = createContext(true);
