// Register background tasks before Expo Router mounts any screen, including a cold start.
import './services/backgroundNotificationTask';
import './services/driverBackgroundLocationTask';
import './services/passengerBackgroundLocationTask';
import './services/notifeeBackgroundHandler';
import './services/notifeeForegroundService';
import 'expo-router/entry';
