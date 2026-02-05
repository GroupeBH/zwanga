declare module '@notifee/react-native' {
  export enum EventType {
    UNKNOWN = -1,
    DISMISSED = 0,
    PRESS = 1,
    ACTION_PRESS = 2,
    DELIVERED = 3,
  }

  export enum AndroidImportance {
    NONE = 0,
    MIN = 1,
    LOW = 2,
    DEFAULT = 3,
    HIGH = 4,
  }

  export enum AndroidCategory {
    ALARM = 'alarm',
    CALL = 'call',
    NAVIGATION = 'navigation',
    MESSAGE = 'msg',
    SOCIAL = 'social',
    TRANSPORT = 'transport',
    SERVICE = 'service',
    SYSTEM = 'sys',
    RECOMMENDATION = 'recommendation',
    STATUS = 'status',
    PROGRESS = 'progress',
    REMINDER = 'reminder',
    EVENT = 'event',
  }

  export enum AndroidVisibility {
    SECRET = -1,
    PRIVATE = 0,
    PUBLIC = 1,
  }

  export enum AndroidStyle {
    BIGPICTURE = 'BIGPICTURE',
    BIGTEXT = 'BIGTEXT',
    INBOX = 'INBOX',
    MESSAGING = 'MESSAGING',
  }

  export interface AndroidPressAction {
    id: string;
    launchActivity?: 'default' | string;
    [key: string]: any;
  }

  export interface AndroidNotificationAction {
    title: string;
    pressAction: AndroidPressAction;
    [key: string]: any;
  }

  export interface AndroidNotificationStyle {
    type?: AndroidStyle | string;
    text?: string;
    [key: string]: any;
  }

  export interface AndroidChannel {
    id: string;
    name: string;
    description?: string;
    importance?: AndroidImportance | number;
    vibration?: boolean;
    lights?: boolean;
    lightColor?: string;
    [key: string]: any;
  }

  export interface AndroidOptions {
    channelId?: string;
    pressAction?: AndroidPressAction;
    smallIcon?: string;
    largeIcon?: string;
    importance?: AndroidImportance | number;
    category?: AndroidCategory | string;
    visibility?: AndroidVisibility | number;
    colorized?: boolean;
    ongoing?: boolean;
    autoCancel?: boolean;
    onlyAlertOnce?: boolean;
    asForegroundService?: boolean;
    fullScreenAction?: AndroidPressAction;
    color?: string;
    actions?: AndroidNotificationAction[];
    showTimestamp?: boolean;
    timestamp?: number;
    chronometerDirection?: 'up' | 'down';
    showChronometer?: boolean;
    style?: AndroidNotificationStyle;
    [key: string]: any;
  }

  export interface IOSOptions {
    sound?: string;
    categoryId?: string;
    interruptionLevel?: 'passive' | 'active' | 'timeSensitive' | 'critical' | string;
    relevanceScore?: number;
    [key: string]: any;
  }

  export interface Notification {
    id?: string;
    title?: string;
    body?: string;
    subtitle?: string;
    data?: Record<string, any>;
    android?: AndroidOptions;
    ios?: IOSOptions;
    [key: string]: any;
  }

  export interface ForegroundEventDetail {
    notification?: Notification;
    pressAction?: AndroidPressAction;
    [key: string]: any;
  }

  export interface ForegroundEvent {
    type: EventType | number;
    detail: ForegroundEventDetail;
  }

  export type BackgroundEvent = ForegroundEvent;

  export type DisplayNotificationOptions = Notification;

  export type ForegroundServiceTask = (
    notification: Notification | undefined,
  ) => Promise<void>;

  interface NotifeeModule {
    requestPermission(): Promise<any>;
    createChannel(channel: AndroidChannel): Promise<string>;
    displayNotification(options: DisplayNotificationOptions): Promise<string>;
    cancelNotification(notificationId: string, tag?: string): Promise<void>;
    stopForegroundService(): Promise<void>;
    onForegroundEvent(
      listener: (event: ForegroundEvent) => void | Promise<void>,
    ): () => void;
    onBackgroundEvent(listener: (event: BackgroundEvent) => Promise<void>): void;
    registerForegroundService(task: ForegroundServiceTask): void;
  }

  const notifee: NotifeeModule;

  export default notifee;
}
