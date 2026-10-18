/** Shared bounds: guidance and map commands must not overlap, even with a bottom inset. */
export function getDriverNavigationLayout(height: number, topInset: number, bottomInset: number) {
  const guidanceBottom = Math.max(12, bottomInset + 8);
  const usableHeight = Math.max(0, height - topInset - guidanceBottom);
  const guidanceMaxHeight = Math.min(124, Math.max(64, usableHeight * (height < 620 ? 0.125 : 0.18)));
  const controlsBottom = guidanceBottom + guidanceMaxHeight + 8;
  const controlsHeight = 56;
  const priorityPanelMaxHeight = Math.max(0, height - (topInset + 8) - controlsBottom - controlsHeight - 12);
  return {
    guidanceBottom,
    guidanceMaxHeight,
    controlsBottom,
    controlsHeight,
    controlsWidth: 4 * controlsHeight + 3 * 8,
    menuBottom: controlsHeight + 8,
    priorityPanelMaxHeight,
    // Leave a clear map band in ordinary navigation. Long content remains scrollable.
    panelMaxHeight: Math.max(0, Math.min(priorityPanelMaxHeight - 12, Math.max(330, usableHeight * 0.52))),
  };
}
