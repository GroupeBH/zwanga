// Shared, native-free ownership: a GPS instruction and an entry announcement
// can overlap during handover without briefly restarting the ringtone.
const holders = new Set<object>();
const listeners = new Set<() => void>();
export const isRideAudioHeld = () => holders.size > 0;
export function subscribeRideAudioFocus(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function holdRideAudio() {
  const token = {};
  holders.add(token); listeners.forEach(listener => listener());
  return () => {
    if (holders.delete(token)) listeners.forEach(listener => listener());
  };
}
