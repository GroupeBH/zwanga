import { styles as containerStyles } from './container.styles';
import { styles as interruptionPromptStyles } from './interruptionPrompt.styles';
import { styles as passengerLocationMarkerStyles } from './passengerLocationMarker.styles';
import { styles as routeSectionToggleButtonStyles } from './routeSectionToggleButton.styles';
import { styles as waypointModalTitleStyles } from './waypointModalTitle.styles';

export const styles = {
  ...containerStyles,
  ...routeSectionToggleButtonStyles,
  ...passengerLocationMarkerStyles,
  ...interruptionPromptStyles,
  ...waypointModalTitleStyles,
};
