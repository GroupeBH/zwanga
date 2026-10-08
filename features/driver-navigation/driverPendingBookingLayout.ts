import { getDriverNavigationLayout } from './driverNavigationLayout';

/** Keep urgent actions above the shared horizontal row of map controls. */
export function getDriverPendingBookingLayout(height: number, topInset: number, bottomInset: number) {
  const layout = getDriverNavigationLayout(height, topInset, bottomInset);
  return {
    ...layout,
    panelMaxHeight: layout.priorityPanelMaxHeight,
  };
}
