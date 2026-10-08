(function () {
  var root = document.documentElement;
  var saved = {};
  try {
    saved =
      JSON.parse(localStorage.getItem("emberdeck.preferences.v1") || "{}") ||
      {};
  } catch {
    root.dataset.preferencesUnavailable = "true";
  }
  var theme = ["light", "dark"].includes(saved.theme)
    ? saved.theme
    : window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  var transparency =
    typeof saved.panelTransparency === "number" &&
    Number.isFinite(saved.panelTransparency)
      ? Math.max(0, Math.min(85, saved.panelTransparency))
      : 0;
  root.style.setProperty("--surface-opacity", String(1 - transparency / 100));
  root.dataset.accent = ["ember", "moss", "diamond", "amethyst"].includes(
    saved.accent,
  )
    ? saved.accent
    : "ember";
  root.dataset.density = ["compact", "comfortable", "large"].includes(
    saved.density,
  )
    ? saved.density
    : "comfortable";
  root.dataset.motion =
    saved.animations === false ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "off"
      : "on";
  root.lang = ["en", "ru"].includes(saved.language)
    ? saved.language
    : navigator.language.startsWith("ru")
      ? "ru"
      : "en";
})();
