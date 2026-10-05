import React from "react";
import ReactDOM from "react-dom/client";
import "@fontsource-variable/inter";
import App from "./app";
import { PreferencesProvider } from "./Preferences";
import { Atmosphere } from "./Atmosphere";
import { FocusCursor } from "./FocusCursor";
import "./style.css";
import "./design-tokens.css";
import "./design-layout.css";
import "./design-controls.css";
import "./design-effects.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PreferencesProvider>
      <Atmosphere />
      <FocusCursor />
      <App />
    </PreferencesProvider>
  </React.StrictMode>,
);
