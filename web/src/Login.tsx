import { useState } from "react";
import { ArrowUpRight, Download, Flame, SlidersHorizontal } from "lucide-react";
import { post } from "./api";
import { sceneArt } from "./scene-art";
import { Button, ErrorBox, Logo } from "./ui";
import { useTranslation } from "./i18n";
import { PageTransition } from "./Motion";

export function Login({ onLogin }: { onLogin: () => void }) {
  const { t } = useTranslation();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  return (
    <div className="login-screen">
      <a
        href="#/settings"
        className="button secondary login-preferences"
        aria-label={t("Personal preferences")}
      >
        <SlidersHorizontal size={17} />
        {t("Settings")}
      </a>
      <div className="login-art" aria-hidden="true">
        <img className="login-scene" src={sceneArt("aurora")} alt="" />
        <div className="login-scene-shade" />
        <div className="login-scene-caption">
          <span>{t("YOUR NEXT WORLD AWAITS")}</span>
          <strong>{t("Your worlds. Your rules.")}</strong>
          <p>{t("A place for everything you build.")}</p>
        </div>
      </div>
      <div className="login-content">
        <PageTransition>
          <Logo />
          <span className="eyebrow">{t("YOUR WORLDS. YOUR RULES.")}</span>
          <h1>
            {t("Welcome home")}
            <span className="orange-text">.</span>
          </h1>
          <p>
            {t("Your servers, your community, your next big idea.")}
            <br />
            {t("It all starts here.")}
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              try {
                await post("/api/auth/login", { token });
                setToken("");
                onLogin();
              } catch (error) {
                setError(
                  error instanceof Error ? error : new Error("Sign in failed"),
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              {t("Access token")}
              <input
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="ed_…"
                autoComplete="current-password"
                required
              />
            </label>
            <ErrorBox error={error} />
            <Button variant="primary" busy={busy} type="submit">
              {t("Enter your workspace")}
              <ArrowUpRight size={17} />
            </Button>
          </form>
          <p className="login-hint">
            {t("Your owner token is in")}{" "}
            <code>/etc/emberdeck/owner-token</code>.
          </p>
          <a className="demo-link" href="#/install">
            <Download size={14} />
            {t("Install on another host")}
            <ArrowUpRight size={14} />
          </a>
          <a className="demo-link" href="/demo">
            {t("Just looking around? Explore the demo")}
            <ArrowUpRight size={14} />
          </a>
          <footer>
            <span className="rust-badge">
              <Flame size={13} />
              {t("Built with Rust")}
            </span>
            <span>{t("Self-hosted. Open source. Yours.")}</span>
          </footer>
        </PageTransition>
      </div>
    </div>
  );
}
