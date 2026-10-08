export type Theme = "system" | "light" | "dark";
export type Language = "en" | "ru";
export type Background =
  "none" | "aurora" | "overworld" | "nether" | "end" | "custom";
export type Accent = "ember" | "moss" | "diamond" | "amethyst";
export type Density = "compact" | "comfortable" | "large";

export interface Preferences {
  theme: Theme;
  language: Language;
  animations: boolean;
  loadingIntro: boolean;
  cursor: boolean;
  background: Background;
  intensity: number;
  accent: Accent;
  density: Density;
}

export const preferencesKey = "emberdeck.preferences.v1";
export const backgroundKey = "emberdeck.background.v1";

export function defaultPreferences(): Preferences {
  return {
    theme: "system",
    language:
      typeof navigator !== "undefined" && navigator.language.startsWith("ru")
        ? "ru"
        : "en",
    animations: true,
    loadingIntro: true,
    cursor: true,
    background: "aurora",
    intensity: 40,
    accent: "ember",
    density: "comfortable",
  };
}

function choice<T extends string | boolean>(
  value: unknown,
  values: readonly T[],
  defaultValue: T,
): T {
  if (value === undefined) return defaultValue;
  const selected = values.find((option) => option === value);
  if (selected === undefined) throw new Error("Invalid saved preference");
  return selected;
}

export function parsePreferences(value: unknown): Preferences {
  const defaults = defaultPreferences();
  if (value === null) return defaults;
  if (typeof value !== "object" || Array.isArray(value))
    throw new Error("Invalid saved preferences");
  const saved = value as Record<string, unknown>;
  if (
    saved.intensity !== undefined &&
    (typeof saved.intensity !== "number" || !Number.isFinite(saved.intensity))
  )
    throw new Error("Invalid background intensity");
  return {
    theme: choice(saved.theme, ["system", "light", "dark"], defaults.theme),
    language: choice(saved.language, ["en", "ru"], defaults.language),
    animations: choice(saved.animations, [true, false], defaults.animations),
    loadingIntro: choice(
      saved.loadingIntro,
      [true, false],
      defaults.loadingIntro,
    ),
    cursor: choice(saved.cursor, [true, false], defaults.cursor),
    background: choice(
      saved.background,
      ["none", "aurora", "overworld", "nether", "end", "custom"],
      defaults.background,
    ),
    intensity:
      typeof saved.intensity === "number" && Number.isFinite(saved.intensity)
        ? Math.max(0, Math.min(80, saved.intensity))
        : defaults.intensity,
    accent: choice(
      saved.accent,
      ["ember", "moss", "diamond", "amethyst"],
      defaults.accent,
    ),
    density: choice(
      saved.density,
      ["compact", "comfortable", "large"],
      defaults.density,
    ),
  };
}

export function loadPreferences(): {
  preferences: Preferences;
  error: string | null;
} {
  if (typeof window === "undefined")
    return { preferences: defaultPreferences(), error: null };
  try {
    const saved = localStorage.getItem(preferencesKey);
    return {
      preferences:
        saved === null
          ? defaultPreferences()
          : parsePreferences(JSON.parse(saved)),
      error: null,
    };
  } catch {
    return {
      preferences: defaultPreferences(),
      error:
        "Saved preferences could not be read. Defaults are active in this tab.",
    };
  }
}

export function validBackground(value: string | null): string | null {
  return value &&
    value.length <= 4 * 1024 * 1024 &&
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value)
    ? value
    : null;
}

export async function prepareBackground(file: File): Promise<string> {
  if (
    !["image/png", "image/jpeg", "image/webp"].includes(file.type) ||
    file.size > 8 * 1024 * 1024
  ) {
    throw new Error("Choose a PNG, JPEG or WebP image up to 8 MiB.");
  }
  const bitmap = await createImageBitmap(file).catch((cause: unknown) => {
    throw new Error("Could not load this image.", { cause });
  });
  try {
    const scale = Math.min(1, 2560 / bitmap.width, 1600 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("This browser cannot prepare a custom background.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = validBackground(canvas.toDataURL("image/webp", 0.82));
    if (!result)
      throw new Error("The image is too large to store. Try a smaller image.");
    return result;
  } finally {
    bitmap.close();
  }
}
