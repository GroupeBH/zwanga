import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type TutorialMap = Record<string, boolean>;

interface TutorialContextValue {
  guides: TutorialMap;
  hasSeen: (id: string) => boolean;
  markSeen: (id: string) => Promise<void>;
  resetGuides: () => Promise<void>;
}

const STORAGE_KEY = 'ZWANGA_TUTORIAL_FLAGS';

const TutorialContext = createContext<TutorialContextValue | undefined>(undefined);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const [guides, setGuides] = useState<TutorialMap>({});
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const loadGuides = async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setGuides(JSON.parse(stored));
        }
      } catch (error) {
        console.warn('[TutorialContext] Unable to load guides flags', error);
      } finally {
        setIsLoaded(true);
      }
    };
    loadGuides();
  }, []);

  const persistGuides = useCallback(async (next: TutorialMap) => {
    setGuides(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('[TutorialContext] Unable to persist guides flags', error);
    }
  }, []);

  const hasSeen = useCallback(
    (id: string) => {
      if (!isLoaded) {
        return false;
      }
      return Boolean(guides[id]);
    },
    [guides, isLoaded],
  );

  const markSeen = useCallback(
    async (id: string) => {
      await persistGuides({ ...guides, [id]: true });
    },
    [guides, persistGuides],
  );

  const resetGuides = useCallback(async () => {
    await persistGuides({});
  }, [persistGuides]);

  const value = useMemo(
    () => ({
      guides,
      hasSeen,
      markSeen,
      resetGuides,
    }),
    [guides, hasSeen, markSeen, resetGuides],
  );

  return <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>;
}

export function useTutorialGuide(id: string) {
  const context = useContext(TutorialContext);
  if (!context) {
    throw new Error('useTutorialGuide must be used within a TutorialProvider');
  }
  const { hasSeen, markSeen } = context;
  const shouldShow = !hasSeen(id);
  const complete = () => markSeen(id);
  return { shouldShow, complete };
}


