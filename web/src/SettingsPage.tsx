import { useId, useRef, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Globe2,
  ImagePlus,
  Monitor,
  Moon,
  MousePointer2,
  Palette,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
} from "lucide-react";
import { useTranslation } from "./i18n";
import { usePreferences } from "./Preferences";
import { Button, ErrorBox, Logo, Select } from "./ui";
import type { Accent, Background, Theme } from "./preferences-model";
import { sceneArt } from "./scene-art";
import { Slider } from "./Slider";
import "./settings.css";

function Choice({
  group,
  value,
  label,
  description,
  selected,
  onSelect,
  children,
  className = "",
}: {
  group: string;
  value: string;
  label: string;
  description?: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
  className?: string;
}) {
  const descriptionId = useId();
  return (
    <label
      data-cursor-scope="choice"
      className={`preference-choice ${selected ? "selected" : ""} ${className}`}
    >
      <input
        type="radio"
        name={group}
        value={value}
        checked={selected}
        onChange={onSelect}
        aria-label={label}
        aria-describedby={description ? descriptionId : undefined}
      />
      {children}
      <span className="choice-label">
        {label}
        {selected && <Check size={14} />}
      </span>
      {description && <small id={descriptionId}>{description}</small>}
    </label>
  );
}

function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  const id = useId();
  return (
    <div className="preference-toggle-row">
      <div>
        <label htmlFor={id}>{label}</label>
        <p>{description}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className={`preference-toggle ${checked ? "on" : ""}`}
        onClick={onChange}
      >
        <span />
      </button>
    </div>
  );
}

function AppearanceSettings() {
  const { preferences, update } = usePreferences();
  const { t } = useTranslation();
  const themes: { id: Theme; name: string; icon: typeof Sun }[] = [
    { id: "light", name: "Light", icon: Sun },
    { id: "dark", name: "Dark", icon: Moon },
    { id: "system", name: "System", icon: Monitor },
  ];
  const accents: { id: Accent; name: string }[] = [
    { id: "ember", name: "Ember" },
    { id: "moss", name: "Moss" },
    { id: "diamond", name: "Diamond" },
    { id: "amethyst", name: "Amethyst" },
  ];
  return (
    <section className="panel preference-panel">
      <h2>
        <Palette size={20} />
        {t("Appearance")}
      </h2>
      <fieldset>
        <legend>{t("Theme")}</legend>
        <div className="theme-choices">
          {themes.map(({ id, name, icon: Icon }) => (
            <Choice
              key={id}
              group="theme"
              value={id}
              label={t(name)}
              selected={preferences.theme === id}
              onSelect={() => update({ theme: id })}
            >
              <span className={`theme-sample theme-sample-${id}`}>
                <i />
                <span>
                  <b />
                  <b />
                  <b />
                </span>
                <Icon size={17} />
              </span>
            </Choice>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>{t("Accent color")}</legend>
        <div className="accent-choices">
          {accents.map(({ id, name }) => (
            <Choice
              key={id}
              group="accent"
              value={id}
              label={t(name)}
              selected={preferences.accent === id}
              onSelect={() => update({ accent: id })}
              className="accent-choice"
            >
              <i className={`accent-sample accent-${id}`} />
            </Choice>
          ))}
        </div>
      </fieldset>
      <div className="preference-fields">
        <label>
          {t("Interface size")}
          <Select
            label={t("Interface size")}
            value={preferences.density}
            onValueChange={(value) =>
              update({
                density:
                  value === "compact"
                    ? "compact"
                    : value === "large"
                      ? "large"
                      : "comfortable",
              })
            }
            options={[
              { value: "compact", label: t("Compact") },
              { value: "comfortable", label: t("Comfortable") },
              { value: "large", label: t("Large") },
            ]}
          />
          <small>
            {t("Fluid layouts and readable text, including on 2K displays.")}
          </small>
        </label>
        <label>
          {t("Language")}
          <Select
            label={t("Language")}
            value={preferences.language}
            onValueChange={(value) =>
              update({ language: value === "ru" ? "ru" : "en" })
            }
            options={[
              { value: "en", label: "English" },
              { value: "ru", label: "Русский" },
            ]}
          />
          <small>
            {t(
              "Changes apply immediately. Your server names, files and console text stay original.",
            )}
          </small>
        </label>
      </div>
    </section>
  );
}

function MotionSettings() {
  const { preferences, update, reducedMotion } = usePreferences();
  const { t } = useTranslation();
  return (
    <section className="panel preference-panel">
      <h2>
        <Sparkles size={20} />
        {t("Motion & interaction")}
      </h2>
      <Toggle
        label={t("Animations")}
        description={t(
          "Page transitions, gentle reveals and responsive micro-interactions.",
        )}
        checked={preferences.animations}
        onChange={() => update({ animations: !preferences.animations })}
      />
      <Toggle
        label={t("Smooth startup")}
        description={t(
          "Show the opening animation for at least 0.9 seconds, even when the panel is ready sooner. Turn off to open immediately.",
        )}
        checked={preferences.loadingIntro}
        onChange={() => update({ loadingIntro: !preferences.loadingIntro })}
      />
      <Toggle
        label={t("Focus cursor")}
        description={t(
          "A soft pointer that frames interactive elements. Mouse and trackpad only.",
        )}
        checked={preferences.cursor}
        onChange={() => update({ cursor: !preferences.cursor })}
      />
      {reducedMotion && (
        <div className="notice">
          <MousePointer2 size={17} />
          <span>
            {t(
              "Your system requests reduced motion. Decorative animations are paused.",
            )}
          </span>
        </div>
      )}
    </section>
  );
}

function BackgroundSettings() {
  const { preferences, update, customImage, setImage } = usePreferences();
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const options: { id: Background; name: string; description: string }[] = [
    {
      id: "none",
      name: "Quiet canvas",
      description: "A distraction-free workspace.",
    },
    {
      id: "aurora",
      name: "Golden hour",
      description: "The last light over a forest lake.",
    },
    {
      id: "overworld",
      name: "Overworld",
      description: "Pixel hills, clouds and a little room to breathe.",
    },
    {
      id: "nether",
      name: "Nether",
      description: "Warm ember trails, deep below.",
    },
    {
      id: "end",
      name: "The End",
      description: "Floating islands and distant stars.",
    },
  ];
  async function changeImage(file: File | null) {
    setBusy(true);
    setError(null);
    try {
      await setImage(file);
    } catch (error) {
      setError(
        error instanceof Error
          ? error
          : new Error("Could not load this image."),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel preference-panel background-settings">
      <h2>
        <ImagePlus size={20} />
        {t("Background")}
      </h2>
      <fieldset>
        <legend>{t("Pick an atmosphere")}</legend>
        <div className="background-choices">
          {options.map((option) => (
            <Choice
              key={option.id}
              group="background"
              value={option.id}
              label={t(option.name)}
              description={t(option.description)}
              selected={preferences.background === option.id}
              onSelect={() => update({ background: option.id })}
            >
              <span
                className={`background-sample sample-${option.id}`}
                style={
                  option.id === "none" || option.id === "custom"
                    ? undefined
                    : { backgroundImage: `url(${sceneArt(option.id, true)})` }
                }
              />
            </Choice>
          ))}
          {customImage && (
            <Choice
              group="background"
              value="custom"
              label={t("Your image")}
              selected={preferences.background === "custom"}
              onSelect={() => update({ background: "custom" })}
            >
              <span
                className="background-sample"
                style={{ backgroundImage: `url(${customImage})` }}
              />
            </Choice>
          )}
        </div>
      </fieldset>
      <Slider
        label={t("Background intensity")}
        value={preferences.intensity}
        valueLabel={`${preferences.intensity}%`}
        onValueChange={(intensity) => update({ intensity })}
        min={0}
        max={80}
        step={5}
        minLabel="0%"
        maxLabel="80%"
      />
      <div className="custom-background-actions">
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          aria-label={t("Choose an image")}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) void changeImage(file);
          }}
        />
        <Button busy={busy} onClick={() => input.current?.click()}>
          <ImagePlus size={16} />
          {t("Choose an image")}
        </Button>
        {customImage && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void changeImage(null)}
          >
            <Trash2 size={16} />
            {t("Remove image")}
          </Button>
        )}
      </div>
      <p className="preference-note">
        {t(
          "PNG, JPEG or WebP up to 8 MiB. Resized and stored only in this browser.",
        )}
      </p>
      <a
        className="artwork-credit"
        href="https://modrinth.com/shader/photon-shader/gallery"
        target="_blank"
        rel="noreferrer"
      >
        {t("Minecraft screenshots · Photon Shaders")}
        <ArrowUpRight size={12} />
      </a>
      <ErrorBox error={error} />
    </section>
  );
}

export function SettingsPage({ onBack }: { onBack?: () => void }) {
  const { t } = useTranslation();
  const { reset, storageError } = usePreferences();
  return (
    <div className={onBack ? "preferences-standalone" : "preferences-page"}>
      {onBack && (
        <header className="install-header">
          <Logo />
          <Button variant="ghost" onClick={onBack}>
            <ArrowLeft size={16} />
            {t("Back to workspace")}
          </Button>
        </header>
      )}
      <div className="page-heading preference-heading">
        <div>
          <span className="eyebrow">{t("MAKE YOURSELF AT HOME")}</span>
          <h1>
            {t("A workspace that feels like you")}
            <span className="orange-text">.</span>
          </h1>
          <p>{t("Light or dark. Quiet or alive. Make Emberdeck your own.")}</p>
        </div>
        <span className="saved-preferences">
          {storageError ? (
            <AlertCircle size={15} />
          ) : (
            <CheckCircle2 size={15} />
          )}
          {t(storageError ? "Review preferences" : "Saved on this device")}
        </span>
      </div>
      <ErrorBox error={storageError} />
      <div className="preferences-layout">
        <div className="preference-column">
          <AppearanceSettings />
          <MotionSettings />
        </div>
        <div className="preference-column">
          <BackgroundSettings />
          <section className="panel preference-preview">
            <span className="eyebrow">{t("Preview")}</span>
            <div>
              <span className="preview-world">
                <Globe2 size={25} />
              </span>
              <div>
                <h3>{t("Your next world")}</h3>
                <p>{t("A little more personal.")}</p>
              </div>
              <span className="status online">
                <span className="status-dot" />
                {t("Online")}
              </span>
            </div>
            <div className="preview-bars">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
          </section>
        </div>
      </div>
      <section className="panel preference-help">
        <div>
          <SlidersHorizontal size={20} />
          <div>
            <h2>{t("Help & deployment")}</h2>
            <p>
              {t("Setting up another machine?")}{" "}
              {t(
                "Installation lives here, away from your everyday server dashboard.",
              )}
            </p>
          </div>
        </div>
        <a className="button secondary" href="#/install">
          {t("Open installation guide")}
          <ArrowUpRight size={16} />
        </a>
      </section>
      <div className="preference-footer">
        <span>{t("Personal preferences")}</span>
        <Button variant="ghost" onClick={reset}>
          <RotateCcw size={15} />
          {t("Reset appearance")}
        </Button>
      </div>
    </div>
  );
}
