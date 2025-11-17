declare module '@notifee/react-native' {
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

  export interface DisplayNotificationOptions {
    title?: string;
    body?: string;
    android?: AndroidOptions;
    ios?: IOSOptions;
  }

  interface NotifeeModule {
    requestPermission(): Promise<void>;
    createChannel(channel: AndroidChannel): Promise<string>;
    displayNotification(options: DisplayNotificationOptions): Promise<string>;
  }

  const notifee: NotifeeModule;

  export default notifee;
}

