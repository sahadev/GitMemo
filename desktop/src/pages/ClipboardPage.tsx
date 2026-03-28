import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { Clipboard, Play, Square, Save, Clock, Copy, Check } from "lucide-react";

interface ClipboardStatus {
  watching: boolean;
  clips_count: number;
  clips_dir: string;
}

interface ClipboardEvent {
  saved: boolean;
  path: string;
  preview: string;
  timestamp: string;
}

interface FileEntry {
  name: string;
  path: string;
  source_type: string;
  modified: string;
  size: number;
  preview: string;
}

export default function ClipboardPage() {
  const [status, setStatus] = useState<ClipboardStatus | null>(null);
  const [recentClips, setRecentClips] = useState<ClipboardEvent[]>([]);
  const [savedClips, setSavedClips] = useState<FileEntry[]>([]);
  const [toast, setToast] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    loadStatus();
    loadSavedClips();
    const unlisten = listen<ClipboardEvent>("clipboard-saved", (event) => {
      setRecentClips((prev) => [event.payload, ...prev].slice(0, 20));
      loadSavedClips();
    });
    return () => { unlisten.then((fn) => fn()); };
  }, []);

  const loadStatus = async () => {
    try { setStatus(await invoke<ClipboardStatus>("get_clipboard_status")); }
    catch (e) { console.error(e); }
  };

  const loadSavedClips = async () => {
    try { setSavedClips(await invoke<FileEntry[]>("list_files", { folder: "clips" })); }
    catch (e) { console.error(e); }
  };

  const toggleWatch = async () => {
    try {
      if (status?.watching) {
        await invoke<string>("stop_clipboard_watch");
      } else {
        await invoke<string>("start_clipboard_watch");
      }
      loadStatus();
    } catch (e) { showToast(`Error: ${e}`); }
  };

  const saveNow = async () => {
    try {
      const text = await readText();
      if (!text || text.trim().length < 20) {
        showToast("Clipboard too short (min 20 chars)");
        return;
      }
      const result = await invoke<ClipboardEvent>("save_clipboard_now", { content: text });
      setRecentClips((prev) => [result, ...prev].slice(0, 20));
      showToast("Saved!");
      loadSavedClips();
      loadStatus();
    } catch (e) { showToast(`Error: ${e}`); }
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const copyClip = async (path: string, id: string) => {
    try {
      const content = await invoke<string>("read_file", { filePath: path });
      // Strip frontmatter
      const body = content.replace(/^---[\s\S]*?---\s*/, "").trim();
      await navigator.clipboard.writeText(body);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch (e) {
      showToast(`Copy failed: ${e}`);
    }
  };

  const cardStyle = {
    background: "var(--bg-card)",
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "16px 20px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 28px", borderBottom: "1px solid var(--border)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Clipboard size={20} style={{ color: "var(--accent)" }} />
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>Clipboard Monitor</h1>
          {status && (
            <span style={{
              padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 500,
              background: status.watching ? "#0f2d0f" : "var(--bg-hover)",
              color: status.watching ? "var(--green)" : "var(--text-secondary)",
            }}>
              {status.watching ? "Watching" : "Stopped"}
            </span>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={saveNow} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
            borderRadius: 6, fontSize: 12, cursor: "pointer",
            background: "var(--bg)", border: "1px solid var(--border)", color: "var(--text-secondary)",
          }}>
            <Save size={13} /> Save Now
          </button>
          <button onClick={toggleWatch} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "7px 14px",
            borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: "pointer",
            background: status?.watching ? "#2d1515" : "#0f2d0f",
            color: status?.watching ? "var(--red)" : "var(--green)",
            border: `1px solid ${status?.watching ? "#5a2020" : "#205a20"}`,
          }}>
            {status?.watching ? <><Square size={13} /> Stop</> : <><Play size={13} /> Start</>}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
        {/* Stats Row */}
        <div style={{ display: "flex", gap: 16, marginBottom: 28 }}>
          <div style={{ ...cardStyle, flex: 1 }}>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>Total Clips</p>
            <p style={{ fontSize: 28, fontWeight: 700 }}>{status?.clips_count ?? 0}</p>
          </div>
          <div style={{ ...cardStyle, flex: 1 }}>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 6 }}>This Session</p>
            <p style={{ fontSize: 28, fontWeight: 700 }}>{recentClips.length}</p>
          </div>
        </div>

        {/* Activity */}
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Recent Activity</h2>

        {recentClips.length === 0 && savedClips.length === 0 ? (
          <div style={{
            ...cardStyle, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", padding: "48px 20px",
          }}>
            <Clipboard size={40} style={{ color: "var(--border)", marginBottom: 12 }} />
            <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
              No clips yet. Start watching or save manually.
            </p>
            <p style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6 }}>
              Copy text (20+ chars) to auto-capture
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {recentClips.map((clip, i) => (
              <div key={i} style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Clock size={11} style={{ color: "var(--text-secondary)" }} />
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{clip.timestamp}</span>
                    <span style={{
                      fontSize: 10, padding: "2px 8px", borderRadius: 4,
                      background: "var(--bg-hover)", color: "var(--green)",
                    }}>saved</span>
                  </div>
                  <button
                    onClick={() => copyClip(clip.path, `recent-${i}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
                      borderRadius: 5, fontSize: 11, cursor: "pointer",
                      background: "var(--bg)", border: "1px solid var(--border)",
                      color: copiedId === `recent-${i}` ? "var(--green)" : "var(--text-secondary)",
                    }}
                  >
                    {copiedId === `recent-${i}` ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                  </button>
                </div>
                <p style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {clip.preview}
                </p>
                <p style={{ fontSize: 10, marginTop: 6, color: "var(--text-secondary)" }}>{clip.path}</p>
              </div>
            ))}

            {savedClips.map((file) => (
              <div key={file.path} style={cardStyle}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Clock size={11} style={{ color: "var(--text-secondary)" }} />
                    <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{file.modified}</span>
                  </div>
                  <button
                    onClick={() => copyClip(file.path, `saved-${file.path}`)}
                    style={{
                      display: "flex", alignItems: "center", gap: 4, padding: "4px 10px",
                      borderRadius: 5, fontSize: 11, cursor: "pointer",
                      background: "var(--bg)", border: "1px solid var(--border)",
                      color: copiedId === `saved-${file.path}` ? "var(--green)" : "var(--text-secondary)",
                    }}
                  >
                    {copiedId === `saved-${file.path}` ? <><Check size={11} /> Copied</> : <><Copy size={11} /> Copy</>}
                  </button>
                </div>
                <p style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {file.preview || file.name}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 16, right: 16, padding: "10px 16px",
          borderRadius: 8, fontSize: 12, zIndex: 50,
          background: toast.startsWith("Error") ? "#2d1515" : "var(--bg-card)",
          color: toast.startsWith("Error") ? "var(--red)" : "var(--green)",
          border: "1px solid var(--border)", boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
        }}>
          {toast}
        </div>
      )}
    </div>
  );
}
