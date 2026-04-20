import { useEffect, useState, type FormEvent } from "react";

interface LandingPageProps {
  onEnter: (code: string) => void;
}

const RECENTS_KEY = "nebulashare:recents";
const MAX_RECENTS = 5;

function generateCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

interface RecentRoom {
  code: string;
  ts: number;
}

function readRecents(): RecentRoom[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (r): r is RecentRoom => r && typeof r.code === "string" && /^[A-Z0-9]{6}$/.test(r.code),
      )
      .slice(0, MAX_RECENTS);
  } catch {
    return [];
  }
}

export function recordRecentRoom(code: string) {
  if (typeof window === "undefined") return;
  const upper = code.toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(upper)) return;
  try {
    const current = readRecents().filter((r) => r.code !== upper);
    const next = [{ code: upper, ts: Date.now() }, ...current].slice(0, MAX_RECENTS);
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // ignore quota / privacy mode
  }
}

function removeRecent(code: string): RecentRoom[] {
  const next = readRecents().filter((r) => r.code !== code);
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function LandingPage({ onEnter }: LandingPageProps) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [recents, setRecents] = useState<RecentRoom[]>([]);

  useEffect(() => {
    setRecents(readRecents());
  }, []);

  const handleJoin = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(trimmed)) {
      setError("Enter a valid 6-character code");
      return;
    }
    setError("");
    onEnter(trimmed);
  };

  const handleCreate = () => {
    onEnter(generateCode());
  };

  const handleRemove = (e: React.MouseEvent, code: string) => {
    e.stopPropagation();
    setRecents(removeRecent(code));
  };

  const handleClearAll = () => {
    if (typeof window === "undefined") return;
    const ok = window.confirm("Clear all recent rooms? This cannot be undone.");
    if (!ok) return;
    try {
      window.localStorage.removeItem(RECENTS_KEY);
    } catch {
      /* ignore */
    }
    setRecents([]);
  };

  return (
    <>
      <div className="aurora" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>

      <main className="landing">
        <div className="landing-card glass">
          <div className="landing-brand">
            <div className="logo logo-lg" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="32"
                height="32"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 2 3 7l9 5 9-5-9-5z" />
                <path d="m3 17 9 5 9-5" />
                <path d="m3 12 9 5 9-5" />
              </svg>
            </div>
            <h1 className="landing-title">NebulaShare</h1>
            <p className="landing-subtitle">Secure peer-to-peer file sharing &amp; chat</p>
            <div className="landing-tags">
              <span className="badge secure">
                <svg
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                E2E Encrypted
              </span>
              <span className="badge secure">⚡ No servers</span>
              <span className="badge secure">✨ AI ready</span>
            </div>
          </div>

          <button className="landing-btn primary" onClick={handleCreate} type="button">
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Create New Room
          </button>

          <div className="landing-divider">
            <span>or join existing</span>
          </div>

          <form className="landing-join" onSubmit={handleJoin}>
            <input
              type="text"
              maxLength={6}
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError("");
              }}
              placeholder="Enter 6-digit code"
              className="landing-input"
              autoComplete="off"
              spellCheck={false}
              aria-label="Room code"
            />
            <button className="landing-btn secondary" type="submit">
              Join
              <svg
                viewBox="0 0 24 24"
                width="16"
                height="16"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 5l7 7-7 7" />
              </svg>
            </button>
          </form>
          {error && <div className="landing-error">{error}</div>}

          {recents.length > 0 && (
            <div className="recents">
              <div className="recents-head">
                <span>Recent rooms</span>
                <button
                  type="button"
                  className="recents-clear"
                  onClick={handleClearAll}
                  title="Clear all recent rooms"
                >
                  Clear all
                </button>
              </div>
              <ul className="recents-list">
                {recents.map((r) => (
                  <li key={r.code}>
                    <button
                      type="button"
                      className="recent-item"
                      onClick={() => onEnter(r.code)}
                      title={`Rejoin room ${r.code}`}
                    >
                      <span className="recent-icon" aria-hidden="true">
                        <svg
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                      </span>
                      <code className="recent-code">{r.code}</code>
                      <span className="recent-time">{relativeTime(r.ts)}</span>
                      <span
                        className="recent-remove"
                        role="button"
                        tabIndex={0}
                        aria-label={`Forget room ${r.code}`}
                        onClick={(e) => handleRemove(e, r.code)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            setRecents(removeRecent(r.code));
                          }
                        }}
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="14"
                          height="14"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="landing-foot">
            Files stream directly between devices. Nothing touches a server.
          </p>
        </div>
      </main>
    </>
  );
}
