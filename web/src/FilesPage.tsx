import { useRef, useState } from "react";
import {
  ArrowLeft,
  ChevronRight,
  Download,
  File,
  FilePlus2,
  Folder,
  FolderPlus,
  LockKeyhole,
  Pencil,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { api, useApi } from "./api";
import { useWorkspace } from "./context";
import type { FileContent, FileEntry, GameServer } from "./types";
import {
  Button,
  CopyButton,
  ErrorBox,
  Loading,
  Modal,
  bytes,
  date,
  saveFile,
} from "./ui";

export function FilesPage({ server }: { server: GameServer }) {
  const { revision, runAction, can, notify } = useWorkspace();
  const [path, setPath] = useState("/");
  const [selected, setSelected] = useState<FileContent | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<
    "file" | "folder" | "rename" | "remove" | null
  >(null);
  const [entry, setEntry] = useState<FileEntry | null>(null);
  const [name, setName] = useState("");
  const [sftp, setSftp] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const files = useApi<{ entries: FileEntry[] }>(
    `/api/servers/${server.id}/files?path=${encodeURIComponent(path)}`,
    0,
    revision,
  );
  const writable = can("files.write", server.id);
  const fullPath = (name: string) => `${path.replace(/\/$/, "")}/${name}`;
  async function openFile(entry: FileEntry) {
    if (entry.is_dir) {
      setPath(entry.path.replace(/^\.\//, ""));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const file = await api<FileContent>(
        `/api/servers/${server.id}/file?path=${encodeURIComponent(entry.path)}`,
      );
      setSelected(file);
      setDraft(file.content);
    } catch (error) {
      setError(error instanceof Error ? error : new Error("Cannot open file"));
    } finally {
      setBusy(false);
    }
  }
  function download(file: FileContent) {
    const data =
      file.encoding === "base64"
        ? Uint8Array.from(atob(file.content), (char) => char.charCodeAt(0))
        : file.content;
    saveFile(
      file.path.split("/").at(-1) || "download",
      data,
      "application/octet-stream",
    );
  }
  async function mutateFile() {
    setBusy(true);
    const action =
      dialog === "file"
        ? { action: "write_file", path: fullPath(name), content: "" }
        : dialog === "folder"
          ? { action: "mkdir", path: fullPath(name) }
          : dialog === "rename"
            ? { action: "rename_file", from: entry?.path, to: fullPath(name) }
            : { action: "remove_file", path: entry?.path };
    const result = await runAction(server.id, action);
    setBusy(false);
    if (result) {
      setDialog(null);
      void files.refresh();
    }
  }
  return (
    <>
      <ErrorBox error={error || files.error} />
      {selected ? (
        <div className="editor">
          <header>
            <button
              className="icon-button"
              aria-label="Back to files"
              onClick={() => {
                if (
                  draft !== selected.content &&
                  !window.confirm("Discard unsaved changes?")
                )
                  return;
                setSelected(null);
              }}
            >
              <ArrowLeft size={17} />
            </button>
            <File size={15} />
            <strong>{selected.path}</strong>
            {draft !== selected.content && <span className="dot orange" />}
            <span className="tag">{bytes(selected.size)}</span>
            <button
              className="icon-button"
              aria-label="Download file"
              onClick={() => download(selected)}
            >
              <Download size={15} />
            </button>
            {selected.encoding === "utf8" && (
              <Button
                variant="primary"
                busy={busy}
                disabled={!writable || draft === selected.content}
                onClick={async () => {
                  setBusy(true);
                  const result = await runAction(server.id, {
                    action: "write_file",
                    path: selected.path,
                    content: draft,
                    expected_hash: selected.sha256,
                  });
                  if (result) {
                    try {
                      const file = await api<FileContent>(
                        `/api/servers/${server.id}/file?path=${encodeURIComponent(selected.path)}`,
                      );
                      setSelected(file);
                      setDraft(file.content);
                    } catch (error) {
                      notify(String(error), true);
                    }
                  }
                  setBusy(false);
                }}
              >
                <Save size={13} />
                Save
              </Button>
            )}
          </header>
          {selected.encoding === "utf8" ? (
            <textarea
              aria-label="File contents"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              readOnly={!writable}
              spellCheck={false}
            />
          ) : (
            <div className="empty">
              <h3>Binary file</h3>
              <p>Download this file to open it in a local application.</p>
              <Button onClick={() => download(selected)}>
                <Download size={15} />
                Download
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="file-toolbar">
            <div className="file-breadcrumbs">
              <button onClick={() => setPath("/")}>
                <Folder size={15} /> /
              </button>
              {path
                .split("/")
                .filter((part) => part && part !== ".")
                .map((part, i, parts) => (
                  <span
                    key={i}
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      alignItems: "center",
                    }}
                  >
                    <ChevronRight size={12} />
                    <button
                      onClick={() => setPath(parts.slice(0, i + 1).join("/"))}
                    >
                      {part}
                    </button>
                  </span>
                ))}
            </div>
            <div className="file-toolbar-actions">
              <Button onClick={() => setSftp(true)}>
                <LockKeyhole size={13} />
                SFTP
              </Button>
              {writable && (
                <>
                  <Button
                    onClick={() => {
                      setDialog("folder");
                      setName("");
                    }}
                  >
                    <FolderPlus size={13} />
                    Folder
                  </Button>
                  <Button
                    onClick={() => {
                      setDialog("file");
                      setName("");
                    }}
                  >
                    <FilePlus2 size={13} />
                    File
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => upload.current?.click()}
                    busy={busy}
                  >
                    <Upload size={13} />
                    Upload
                  </Button>
                </>
              )}
            </div>
          </div>
          <input
            ref={upload}
            type="file"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (file.size > 32 * 1024 ** 2) {
                notify(
                  "Web uploads are limited to 32 MiB. Use SFTP for larger files.",
                  true,
                );
                event.target.value = "";
                return;
              }
              setBusy(true);
              try {
                const data = await new Promise<string>((resolve, reject) => {
                  const reader = new FileReader();
                  reader.onload = () =>
                    resolve(String(reader.result).split(",")[1]);
                  reader.onerror = () => reject(reader.error);
                  reader.readAsDataURL(file);
                });
                const result = await runAction(server.id, {
                  action: "upload",
                  path: fullPath(file.name),
                  data,
                });
                if (result) void files.refresh();
              } catch (error) {
                notify(String(error), true);
              } finally {
                setBusy(false);
                if (upload.current) upload.current.value = "";
              }
            }}
          />
          {files.loading ? (
            <Loading />
          ) : (
            <div className="panel table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Size</th>
                    <th>Modified</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {files.data?.entries.map((file) => (
                    <tr key={file.path}>
                      <td>
                        <button
                          className="row-link"
                          onClick={() => void openFile(file)}
                        >
                          {file.is_dir ? (
                            <Folder size={16} className="orange-text" />
                          ) : (
                            <File size={16} />
                          )}{" "}
                          {file.name}
                        </button>
                      </td>
                      <td>{file.is_dir ? "—" : bytes(file.size)}</td>
                      <td>{date(file.modified)}</td>
                      <td>
                        <div className="row-actions">
                          {writable && (
                            <>
                              <button
                                className="icon-button"
                                aria-label={`Rename ${file.name}`}
                                onClick={() => {
                                  setEntry(file);
                                  setName(file.name);
                                  setDialog("rename");
                                }}
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Delete ${file.name}`}
                                onClick={() => {
                                  setEntry(file);
                                  setDialog("remove");
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {files.data?.entries.length === 0 && (
                <p className="quiet">This directory is empty.</p>
              )}
            </div>
          )}
          <p className="quiet">
            Files are confined to this server's directory. CPU and memory limits
            are managed separately in Settings.
          </p>
        </>
      )}
      {dialog && (
        <Modal
          title={
            dialog === "remove"
              ? `Delete “${entry?.name}”?`
              : dialog === "rename"
                ? "Rename file or folder"
                : dialog === "folder"
                  ? "Create a folder"
                  : "Create a file"
          }
          subtitle={
            dialog === "remove"
              ? "This removes the selected file. Folders must be empty."
              : `Inside ${path}`
          }
          onClose={() => setDialog(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void mutateFile();
            }}
          >
            {dialog !== "remove" && (
              <label>
                Name
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={200}
                  pattern="[^/\\\\]+"
                />
              </label>
            )}
            <div className="modal-actions">
              <Button type="button" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant={dialog === "remove" ? "danger" : "primary"}
                busy={busy}
              >
                {dialog === "remove"
                  ? "Delete"
                  : dialog === "rename"
                    ? "Rename"
                    : "Create"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
      {sftp && <SftpDialog server={server} onClose={() => setSftp(false)} />}
    </>
  );
}

function SftpDialog({
  server,
  onClose,
}: {
  server: GameServer;
  onClose: () => void;
}) {
  const { runAction, can } = useWorkspace();
  const [readOnly, setReadOnly] = useState(!can("files.write", server.id));
  const [busy, setBusy] = useState(false);
  const [credential, setCredential] = useState<Record<string, unknown> | null>(
    null,
  );
  return (
    <Modal
      title="Your files, in your favorite client."
      subtitle="Temporary SFTP access, scoped to this server only."
      onClose={onClose}
    >
      {credential ? (
        <>
          <div className="credential-grid">
            {[
              ["Host", `${credential.host}:${credential.port}`],
              ["Username", String(credential.username)],
              ["Password", String(credential.password)],
            ].map(([label, value]) => (
              <div className="credential" key={label}>
                <span>{label}</span>
                <code>{value}</code>
                <CopyButton
                  value={value}
                  label={`Copy ${label.toLowerCase()}`}
                />
              </div>
            ))}
          </div>
          <p className="quiet">
            Expires {date(Number(credential.expires_at))} ·{" "}
            {credential.read_only ? "Read only" : "Read and write"}
            <br />
            No shell access. No access to other servers.
          </p>
          <div className="modal-actions">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="notice">
            <LockKeyhole size={17} />
            <span>
              Works with FileZilla, WinSCP, and other SFTP clients. A token is
              issued for one hour. Verify the node's SSH host key on first
              connection.
            </span>
          </div>
          <div style={{ height: 20 }} />
          <label className="checkbox">
            <input
              type="checkbox"
              checked={readOnly}
              disabled={!can("files.write", server.id)}
              onChange={(e) => setReadOnly(e.target.checked)}
            />
            Read-only access
          </label>
          <div className="modal-actions">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              busy={busy}
              onClick={async () => {
                setBusy(true);
                const result = await runAction(server.id, {
                  action: "sftp",
                  read_only: readOnly,
                  ttl_seconds: 3600,
                });
                setBusy(false);
                if (result) setCredential(result);
              }}
            >
              <LockKeyhole size={14} />
              Generate access
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
