import AsyncStorage from '@react-native-async-storage/async-storage';

// No credential or personal data: a durable deny marker, independent of Keychain.
const KEY = 'zwanga.logout-pending.v1';
export const hasLogoutIntent = async () => (await AsyncStorage.getItem(KEY)) !== null;
export const markLogoutIntent = () => AsyncStorage.setItem(KEY, '1');
export const clearLogoutIntent = () => AsyncStorage.removeItem(KEY);
