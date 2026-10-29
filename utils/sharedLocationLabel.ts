import { storedLocationText } from './routeLocationLabels';

type Selection = { title?: string; address?: string } | null;

/** A GPS shortcut is a local action, not an address to send to another person. */
export function sharedLocationLabel(selection: Selection, manualAddress: string) {
  return storedLocationText(manualAddress) || storedLocationText(selection?.address) ||
    storedLocationText(selection?.title);
}
