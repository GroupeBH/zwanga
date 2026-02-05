declare module '@notifee/react-native' {
  export enum EventType {
    PRESS = 1,
    ACTION_PRESS = 2,
    DISMISSED = 3,
  }

  export enum AndroidImportance {
    DEFAULT = 3,
    HIGH = 4,
  }

  export interface AndroidPressAction {
    id: string;
  }

  export interface AndroidChannel {
    id: string;
    name: string;
    importance?: AndroidImportance;
    vibration?: boolean;
  }

  export interface AndroidOptions {
    channelId?: string;
    pressAction?: AndroidPressAction;
  }

  export interface IOSOptions {
    sound?: string;
  }

  export interface Notification {
    id?: string;
    data?: Record<string, any>;
  }

  export interface ForegroundEventDetail {
    notification?: Notification;
    pressAction?: AndroidPressAction;
  }

  export interface ForegroundEvent {
    type: EventType | number;
    detail: ForegroundEventDetail;
  }

  export interface DisplayNotificationOptions {
    title?: string;
    body?: string;
    data?: Record<string, any>;
    android?: AndroidOptions;
    ios?: IOSOptions;
  }

  interface NotifeeModule {
    requestPermission(): Promise<void>;
    createChannel(channel: AndroidChannel): Promise<string>;
    displayNotification(options: DisplayNotificationOptions): Promise<string>;
    onForegroundEvent(listener: (event: ForegroundEvent) => void | Promise<void>): () => void;
  }

  const notifee: NotifeeModule;

  export default notifee;
}

