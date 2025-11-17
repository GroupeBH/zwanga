import type { AppDispatch, RootState } from './index';

/**
 * Store accessor to avoid circular dependencies
 * The store is set after initialization
 */
let storeDispatch: AppDispatch | null = null;
let storeGetState: (() => RootState) | null = null;

export function setStoreAccessor(dispatch: AppDispatch, getState: () => RootState) {
  storeDispatch = dispatch;
  storeGetState = getState;
}

export function getStoreDispatch(): AppDispatch {
  if (!storeDispatch) {
    throw new Error('Store dispatch not initialized. Make sure to call setStoreAccessor after store creation.');
  }
  return storeDispatch;
}

export function getStoreState(): RootState {
  if (!storeGetState) {
    throw new Error('Store getState not initialized. Make sure to call setStoreAccessor after store creation.');
  }
  return storeGetState();
}

