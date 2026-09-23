/** Keep the priority card above the temporary horizontal row of map controls. */
export function getDriverPendingBookingLayout(height: number, topInset: number, bottomInset: number) {
  const controlsBottom = Math.max(180, bottomInset + 12);
  const controlsHeight = 48;
  return {
    controlsBottom,
    controlsWidth: 4 * 48 + 3 * 8,
    menuBottom: controlsHeight + 8,
    panelMaxHeight: Math.max(0, height - (topInset + 8) - controlsBottom - controlsHeight - 12),
  };
}
