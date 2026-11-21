/** Directions at the top, actions at the bottom, an unobstructed map between them. */
export function getDriverNavigationLayout(height: number, topInset: number, bottomInset: number, fontScale = 1) {
  const guidanceTop = topInset + 8;
  const controlsBottom = Math.max(8, bottomInset + 4);
  const usableHeight = Math.max(0, height - guidanceTop - controlsBottom);
  const guidanceMaxHeight = Math.min(fontScale > 1.3 ? 240 : 196, usableHeight * 0.32);
  const controlsHeight = 56;
  const panelBottom = controlsBottom + controlsHeight + 6;
  const priorityPanelMaxHeight = Math.max(0, height - panelBottom - guidanceTop - guidanceMaxHeight - 24);
  return {
    guidanceTop,
    guidanceMaxHeight,
    panelBottom,
    controlsBottom,
    controlsHeight,
    controlsWidth: 2 * controlsHeight + 8,
    menuBottom: controlsHeight + 8,
    priorityPanelMaxHeight,
    // Leave a clear map band in ordinary navigation. Long content remains scrollable.
    panelMaxHeight: Math.max(0, Math.min(priorityPanelMaxHeight - 24, fontScale > 1.3 ? 300 : 240, usableHeight * 0.38)),
  };
}
