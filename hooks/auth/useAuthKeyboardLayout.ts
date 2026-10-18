import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, type ScrollView } from 'react-native';

/** Native Android adjustResize owns avoidance; iOS uses the screen's single KAV. */
export function useAuthKeyboardLayout(enabled: boolean, stepKey: string) {
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    setKeyboardVisible(Keyboard.isVisible());
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, [enabled]);
  useEffect(() => {
    if (enabled) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [enabled, keyboardVisible, stepKey]);
  return { scrollRef, keyboardVisible: enabled && keyboardVisible };
}
