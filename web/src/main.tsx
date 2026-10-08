import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/manrope";
import "@fontsource-variable/golos-text";
import { Startup } from "./Startup";
import { PreferencesProvider } from "./Preferences";
import { Atmosphere } from "./Atmosphere";
import { FocusCursor } from "./FocusCursor";
import "./style.css";
import "./design-tokens.css";
import "./design-layout.css";
import "./design-controls.css";
import "./design-effects.css";
import "./mobile.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreferencesProvider>
      <Atmosphere />
      <FocusCursor />
      <Startup />
    </PreferencesProvider>
  </React.StrictMode>,
);
