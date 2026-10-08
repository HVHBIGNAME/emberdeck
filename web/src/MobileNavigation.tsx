import { useEffect, useState } from "react";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { mainLinks, workspaceLinks } from "./Navigation";
import { useWorkspace } from "./context";
import { useMedia } from "./Preferences";
import { useTranslation } from "./i18n";
import { AnimatePresence, Modal } from "./ui";
import { WorkspaceProfile } from "./WorkspaceProfile";

const dockLinks = [...mainLinks.slice(0, 3), workspaceLinks[3]];

export function MobileNavigation({
  page,
  route,
}: {
  page: string;
  route: string;
}) {
  const { t } = useTranslation();
  const { can } = useWorkspace();
  const narrow = useMedia("(max-width: 1000px)");
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [route, narrow]);
  if (!narrow) return null;
  const secondary = !dockLinks.some(([id]) => id === page);
  const moreLinks = [
    ...mainLinks.slice(3),
    ...workspaceLinks.filter(
      ([id]) => id !== "settings" && (can("admin") || id === "activity"),
    ),
  ];
  return (
    <>
      <nav className="mobile-dock" aria-label={t("Main navigation")}>
        {dockLinks.map(([id, name, Icon]) => (
          <a
            key={id}
            href={`#/${id}`}
            aria-label={t(name)}
            aria-current={page === id ? "page" : undefined}
            className={page === id ? "active" : ""}
          >
            <Icon size={21} aria-hidden="true" />
            <span>{t(name)}</span>
          </a>
        ))}
        <button
          className={secondary || more ? "active" : ""}
          aria-label={t("More sections")}
          aria-haspopup="dialog"
          aria-expanded={more}
          aria-current={secondary ? "page" : undefined}
          onClick={() => setMore(true)}
        >
          <MoreHorizontal size={21} aria-hidden="true" />
          <span>{t("More")}</span>
        </button>
      </nav>
      <AnimatePresence>
        {more && (
          <Modal
            title="Workspace sections"
            className="mobile-sheet"
            onClose={() => setMore(false)}
          >
            <nav className="mobile-menu-grid" aria-label={t("More sections")}>
              {moreLinks.map(([id, name, Icon]) => (
                <a
                  key={id}
                  href={`#/${id}`}
                  aria-current={page === id ? "page" : undefined}
                  onClick={() => setMore(false)}
                >
                  <Icon size={21} aria-hidden="true" />
                  <span>{t(name)}</span>
                </a>
              ))}
            </nav>
            <a
              className="mobile-docs"
              href="https://github.com/HVHBIGNAME/emberdeck/tree/main/docs"
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={17} />
              {t("Documentation")}
            </a>
            <WorkspaceProfile />
          </Modal>
        )}
      </AnimatePresence>
    </>
  );
}
