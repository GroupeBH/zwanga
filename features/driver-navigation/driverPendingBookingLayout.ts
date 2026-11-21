import { getDriverNavigationLayout } from './driverNavigationLayout';

/** Keep urgent actions above the shared horizontal row of map controls. */
export function getDriverPendingBookingLayout(height: number, topInset: number, bottomInset: number, fontScale = 1) {
  const layout = getDriverNavigationLayout(height, topInset, bottomInset, fontScale);
  return {
    ...layout,
    panelMaxHeight: layout.priorityPanelMaxHeight,
  };
}
