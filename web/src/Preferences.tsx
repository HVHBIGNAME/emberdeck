import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { MotionConfig } from "motion/react";
import { I18nextProvider } from "react-i18next";
import i18n from "./i18n";
import {
  backgroundKey,
  defaultPreferences,
  loadPreferences,
  preferencesKey,
  prepareBackground,
  validBackground,
  type Preferences,
} from "./preferences-model";

interface PreferenceContext {
  preferences: Preferences;
  update: (patch: Partial<Preferences>) => void;
  reset: () => void;
  motion: boolean;
  reducedMotion: boolean;
  customImage: string | null;
  setImage: (file: File | null) => Promise<void>;
  storageError: string | null;
}

const Context = createContext<PreferenceContext | null>(null);

export function useMedia(query: string) {
  const media = useMemo(() => window.matchMedia(query), [query]);
  const subscribe = useCallback(
    (listener: () => void) => {
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    [media],
  );
  return useSyncExternalStore(
    subscribe,
    () => media.matches,
    () => false,
  );
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [initial] = useState(loadPreferences);
  const [preferences, setPreferences] = useState(initial.preferences);
  const [readError, setReadError] = useState(initial.error);
  const [writeError, setWriteError] = useState<string | null>(null);
  const storageError = readError || writeError;
  const [customImage, setCustomImage] = useState<string | null>(null);
  const systemDark = useMedia("(prefers-color-scheme: dark)");
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)");
  const motion = preferences.animations && !reducedMotion;
  const update = useCallback((patch: Partial<Preferences>) => {
    setReadError(null);
    setPreferences((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const theme =
      preferences.theme === "system"
        ? systemDark
          ? "dark"
          : "light"
        : preferences.theme;
    root.dataset.theme = theme;
    root.dataset.motion = motion ? "on" : "off";
    root.dataset.accent = preferences.accent;
    root.dataset.density = preferences.density;
    root.lang = preferences.language;
    root.style.colorScheme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "dark" ? "#0e131b" : "#f3f6f7");
    void i18n.changeLanguage(preferences.language);
    try {
      localStorage.setItem(preferencesKey, JSON.stringify(preferences));
      setWriteError(null);
    } catch {
      setWriteError(
        "Your browser could not save these preferences. They apply to this tab only.",
      );
    }
  }, [preferences, motion, systemDark]);

  useEffect(() => {
    const readImage = () => {
      try {
        setCustomImage(validBackground(localStorage.getItem(backgroundKey)));
      } catch {
        setReadError(
          "Your browser could not save these preferences. They apply to this tab only.",
        );
      }
    };
    readImage();
    const receive = (event: StorageEvent) => {
      if (event.key === preferencesKey || event.key === null) {
        const saved = loadPreferences();
        setPreferences(saved.preferences);
        setReadError(saved.error);
      }
      if (event.key === backgroundKey || event.key === null) readImage();
    };
    const visibility = () => {
      document.documentElement.dataset.paused = String(document.hidden);
    };
    window.addEventListener("storage", receive);
    document.addEventListener("visibilitychange", visibility);
    visibility();
    return () => {
      window.removeEventListener("storage", receive);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  const setImage = useCallback(
    async (file: File | null) => {
      const image = file ? await prepareBackground(file) : null;
      try {
        if (image) localStorage.setItem(backgroundKey, image);
        else localStorage.removeItem(backgroundKey);
      } catch {
        throw new Error(
          "Your browser could not store this image. Try a smaller image or allow local storage.",
        );
      }
      setCustomImage(image);
      update({ background: image ? "custom" : "aurora" });
    },
    [update],
  );

  const reset = useCallback(() => {
    setReadError(null);
    setPreferences((current) => ({
      ...defaultPreferences(),
      language: current.language,
    }));
  }, []);
  const value = useMemo(
    () => ({
      preferences,
      update,
      reset,
      motion,
      reducedMotion,
      customImage,
      setImage,
      storageError,
    }),
    [
      preferences,
      update,
      reset,
      motion,
      reducedMotion,
      customImage,
      setImage,
      storageError,
    ],
  );
  return (
    <I18nextProvider i18n={i18n}>
      <Context.Provider value={value}>
        <MotionConfig
          reducedMotion={motion ? "never" : "always"}
          transition={{ duration: motion ? 0.24 : 0 }}
        >
          {children}
        </MotionConfig>
      </Context.Provider>
    </I18nextProvider>
  );
}

export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("Preferences provider is missing");
  return value;
}
