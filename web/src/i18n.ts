import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { loadPreferences } from "./preferences-model";
import common from "./locales/ru-common";
import settings from "./locales/ru-settings";
import dashboard from "./locales/ru-dashboard";
import server from "./locales/ru-server";
import operations from "./locales/ru-operations";
import workspace from "./locales/ru-workspace";
import library from "./locales/ru-library";
import diagnostics from "./locales/ru-diagnostics";
import installation from "./locales/ru-installation";

void i18n.use(initReactI18next).init({
  initAsync: false,
  lng: loadPreferences().preferences.language,
  fallbackLng: "en",
  supportedLngs: ["en", "ru"],
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
  resources: {
    en: {
      translation: {
        "{{count}} servers online_one": "{{count}} server online",
        "{{count}} servers online_other": "{{count}} servers online",
        "{{count}} servers resting, ready when you are_one":
          "{{count}} server resting, ready when you are",
        "{{count}} servers resting, ready when you are_other":
          "{{count}} servers resting, ready when you are",
      },
    },
    ru: {
      translation: {
        ...common,
        ...settings,
        ...dashboard,
        ...server,
        ...operations,
        ...workspace,
        ...library,
        ...diagnostics,
        ...installation,
      },
    },
  },
});

export default i18n;
export { useTranslation } from "react-i18next";
export const locale = () =>
  i18n.resolvedLanguage === "ru" ? "ru-RU" : "en-US";

export const messageText = (message: string) =>
  i18n.t(message.replace(/^(?:Error|ApiError|TypeError): /, ""));
