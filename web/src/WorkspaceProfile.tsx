import { LogOut } from "lucide-react";
import { demo, hostedDemo, post } from "./api";
import { useWorkspace } from "./context";
import { useTranslation } from "./i18n";

export function WorkspaceProfile() {
  const { user, notify } = useWorkspace();
  const { t } = useTranslation();
  return (
    <div className="profile">
      <span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span>
      <div>
        <strong>{user.id === "owner" ? t("Owner") : user.name}</strong>
        <span>
          {demo
            ? t("Read-only demo")
            : t("{{role}} access", {
                role: t(user.role.charAt(0).toUpperCase() + user.role.slice(1)),
              })}
        </span>
      </div>
      {demo ? (
        <a
          href={hostedDemo ? "https://github.com/HVHBIGNAME/emberdeck" : "/"}
          className="icon-button"
          aria-label={t("Leave demo")}
        >
          <LogOut size={18} />
        </a>
      ) : (
        <button
          className="icon-button"
          aria-label={t("Sign out")}
          onClick={async () => {
            try {
              await post("/api/auth/logout", {});
              window.location.assign("/");
            } catch (error) {
              notify(String(error), true);
            }
          }}
        >
          <LogOut size={18} />
        </button>
      )}
    </div>
  );
}
