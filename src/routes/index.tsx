import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
// Suppress TS strict-null complaint for readRoom return type
// (it is always called only after mount).
import nebulaCssUrl from "../nebula/style.css?url";
// Import vanilla JS as a raw string so it can be injected as a real <script>
// (Vite resolves these at build time — no runtime fetch needed.)
import nebulaJsSource from "../nebula/app.js?raw";
import nebulaQrSource from "../nebula/qr.js?raw";
import { LandingPage, recordRecentRoom } from "../components/LandingPage";
import { askGeminiWithContext, type ChatMessage } from "../lib/gemini";

// Always safe to call — only invoked inside useEffect (client-side only).
function readRoom(): string | null {
  const r = new URL(window.location.href).searchParams.get("room");
  return r ? r.toUpperCase() : null;
}

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "NebulaShare — P2P Chat & File Transfer" },
      {
        name: "description",
        content:
          "Lightweight peer-to-peer chat and file sharing with end-to-end encryption and an AI assistant.",
      },
      { name: "theme-color", content: "#0a0b14" },
    ],
    links: [{ rel: "stylesheet", href: nebulaCssUrl }],
  }),
});

function Index() {
  const ranRef = useRef(false);

  // ── Hydration fix ────────────────────────────────────────────────────────
  // On the server (and on the client's FIRST render) we must always produce
  // the same HTML.  Because localStorage / URL can only be read in the
  // browser, we start with null and never read storage during render.
  // isMounted flips to true in the first useEffect so the app only becomes
  // interactive after reconciliation is complete.
  const [isMounted, setIsMounted] = useState(false);
  const [room, setRoom] = useState<string | null>(null);

  // Step 1 — after first paint, read the URL and decide which view to show.
  useEffect(() => {
    setIsMounted(true);
    const initialRoom = readRoom();
    if (initialRoom) setRoom(initialRoom);
  }, []);

  // Called by app.js leaveSession() after WebRTC cleanup to reset React state + URL.
  const handleLeave = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState(null, "", url);
    setRoom(null);
  }, []);

  // Step 2 — expose the AI bridge and leave-callback to the vanilla JS layer.
  useEffect(() => {
    const api = {
      ask: (messages: ChatMessage[], prompt: string) => askGeminiWithContext(messages, prompt),
    };
    (window as Window & { NebulaAI?: typeof api; NebulaLeave?: () => void }).NebulaAI = api;
    (window as Window & { NebulaAI?: typeof api; NebulaLeave?: () => void }).NebulaLeave =
      handleLeave;
    return () => {
      (window as Window & { NebulaAI?: typeof api; NebulaLeave?: () => void }).NebulaAI =
        undefined;
      (window as Window & { NebulaAI?: typeof api; NebulaLeave?: () => void }).NebulaLeave =
        undefined;
    };
  }, [handleLeave]);

  // Step 3 — once a room is chosen (from URL or landing page), boot the
  //           vanilla PeerJS runtime into the live DOM.
  useEffect(() => {
    if (!room || ranRef.current) return;
    ranRef.current = true;

    // Remember this room in the recents list
    recordRecentRoom(room);

    const mountRuntime = () => {
      const qrScript = document.createElement("script");
      qrScript.textContent = nebulaQrSource;
      qrScript.setAttribute("data-nebula-qr", "1");
      document.body.appendChild(qrScript);

      const script = document.createElement("script");
      script.textContent = nebulaJsSource;
      script.setAttribute("data-nebula-js", "1");
      document.body.appendChild(script);
    };

    let peerScript: HTMLScriptElement | null = null;

    if ((window as Window & { Peer?: unknown }).Peer) {
      mountRuntime();
    } else {
      peerScript = document.createElement("script");
      peerScript.src = "https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js";
      peerScript.async = true;
      peerScript.setAttribute("data-peerjs-cdn", "1");
      peerScript.onload = mountRuntime;
      document.body.appendChild(peerScript);
    }

    return () => {
      (window as Window & { NebulaUnmount?: () => void }).NebulaUnmount?.();
      document
        .querySelectorAll("[data-nebula-js],[data-nebula-qr],[data-peerjs-cdn]")
        .forEach((n) => n.remove());
      if (peerScript) peerScript.onload = null;
      ranRef.current = false;
    };
  }, [room]);

  // ── Render guard ─────────────────────────────────────────────────────────
  // Return nothing until the client has mounted.  This guarantees that the
  // very first client render matches the server-rendered HTML (both empty /
  // landing), eliminating the hydration mismatch entirely.
  if (!isMounted) return null;

  if (!room) {
    return (
      <LandingPage
        onEnter={(code) => {
          const url = new URL(window.location.href);
          url.searchParams.set("room", code);
          window.history.pushState(null, "", url);
          setRoom(code);
        }}
      />
    );
  }

  return (
    <>
      {/* Aurora background */}
      <div className="aurora" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>

      <main className="app glass">
        <header className="topbar">
          <div className="brand">
            <button
              id="leaveRoom"
              className="icon-btn leave-btn"
              title="Leave room"
              aria-label="Leave room and return to landing"
            >
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
                <path d="M19 12H5" />
                <path d="m12 19-7-7 7-7" />
              </svg>
            </button>
            <div className="logo" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="22"
                height="22"
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
            <div className="brand-text">
              <h1>NebulaShare</h1>
              <div
                id="roomInfoTrigger"
                className="room-row room-info-trigger"
                role="button"
                tabIndex={0}
                aria-label="Toggle room info panel"
              >
                <span className="muted">Room</span>
                <code id="roomId" className="room-id">
                  ———
                </code>
                <button
                  id="copyRoom"
                  className="icon-btn"
                  title="Copy room code"
                  aria-label="Copy room code"
                >
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
                    <rect x="9" y="9" width="13" height="13" rx="2" />
                    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
                  </svg>
                </button>
                <button
                  id="qrBtn"
                  className="icon-btn"
                  title="Show QR code to join from another device"
                  aria-label="Show QR code"
                >
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
                    <rect x="3" y="3" width="7" height="7" rx="1" />
                    <rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" />
                    <path d="M14 14h3v3h-3zM20 14h1v1h-1zM14 20h1v1h-1zM18 18h3v3h-3z" />
                  </svg>
                </button>
                <input
                  id="peerTarget"
                  type="text"
                  placeholder="Peer ID"
                  aria-label="Target peer id"
                  className="landing-input"
                  style={{ maxWidth: 180, height: 32, marginLeft: 8 }}
                />
                <button
                  id="connectPeer"
                  className="icon-btn"
                  title="Connect to peer"
                  aria-label="Connect to peer"
                >
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
                    <path d="M8 12h8" />
                    <path d="M12 8v8" />
                    <circle cx="12" cy="12" r="9" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          <div className="badges">
            <span
              className="badge secure"
              title="WebRTC DataChannels are end-to-end encrypted via DTLS/SRTP"
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
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              E2EE Secured
            </span>
            <span id="connState" className="badge state state-idle">
              <span className="dot"></span>
              <span id="connLabel">Idle</span>
            </span>
            <button
              id="aiToggle"
              className="badge ai-toggle"
              aria-pressed="false"
              title="Toggle AI Assistant"
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
                <path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
              </svg>
              AI Assist
            </button>
            <button
              id="clearChatBtn"
              className="badge"
              title="Clear chat history"
              aria-label="Clear chat history"
            >
              Clear History
            </button>
          </div>
        </header>

        <section id="chat" className="chat" aria-live="polite">
          <div className="day-divider">
            <span>Today</span>
          </div>

          <div className="bubble in pop">
            <div className="text">
              Welcome to <b>NebulaShare</b> 👋 — share the room code with a friend to start a P2P
              session.
            </div>
            <div className="meta">System · just now</div>
          </div>

          <div className="bubble ai pop">
            <div className="text">
              <b>✨ AI Assistant</b> is ready. Toggle it from the top bar and ask anything.
            </div>
            <div className="meta">AI · just now</div>
          </div>

          <div id="typing" className="bubble in typing hidden" aria-hidden="true">
            <div className="dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </section>

        <div id="dropOverlay" className="drop-overlay hidden" aria-hidden="true">
          <div className="drop-card">
            <svg
              viewBox="0 0 24 24"
              width="42"
              height="42"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.6}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <h2>Drop files to send</h2>
            <p>Files are streamed peer-to-peer, end-to-end encrypted.</p>
          </div>
        </div>

        <footer className="composer">
          <button
            id="attachBtn"
            className="icon-btn round"
            title="Attach file"
            aria-label="Attach file"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.41a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>
          <input id="fileInput" type="file" multiple hidden />

          <div className="input-wrap">
            <textarea
              id="msgInput"
              rows={1}
              placeholder="Type a message…"
              autoComplete="off"
            ></textarea>
          </div>

          <button
            id="micBtn"
            className="icon-btn round"
            title="Record voice note"
            aria-pressed="false"
            aria-label="Record voice note"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </button>

          <button
            id="burnBtn"
            className="icon-btn round"
            title="Self-destruct (30s)"
            aria-pressed="false"
            aria-label="Toggle self-destructing messages"
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="13" r="8" />
              <path d="M12 9v4l2 2" />
              <path d="M9 2h6" />
            </svg>
          </button>

          <button id="sendBtn" className="send" title="Send" aria-label="Send">
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m22 2-7 20-4-9-9-4 20-7z" />
            </svg>
          </button>
        </footer>
      </main>

      <button id="aiFab" className="fab" title="Ask AI">
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
          <path d="M19 14v4" />
          <path d="M17 16h4" />
        </svg>
      </button>

      <canvas id="imgCanvas" hidden></canvas>

      {/* QR modal — opened by #qrBtn, populated by app.js */}
      <div
        id="qrModal"
        className="qr-modal hidden"
        role="dialog"
        aria-labelledby="qrTitle"
        aria-hidden="true"
      >
        <div className="qr-backdrop" data-close="1"></div>
        <div className="qr-card">
          <button className="qr-close" id="qrClose" aria-label="Close">
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <h3 id="qrTitle">Scan to join this room</h3>
          <p className="muted">Point your phone camera at the code below.</p>
          <div className="qr-frame">
            <svg id="qrSvg" width="240" height="240" aria-label="Room QR code"></svg>
          </div>
          <div className="qr-link">
            <code id="qrUrl"></code>
            <button id="qrCopy" className="icon-btn" title="Copy link" aria-label="Copy link">
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
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15V5a2 2 0 0 1 2-2h10" />
              </svg>
            </button>
          </div>
          <button id="qrDownload" className="qr-download" type="button">
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download PNG
          </button>
        </div>
      </div>

      <div
        id="leaveModal"
        className="confirm-modal hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="leaveModalTitle"
        aria-hidden="true"
      >
        <div className="confirm-backdrop" data-confirm-close="1"></div>
        <div className="confirm-card">
          <h3 id="leaveModalTitle">Leave Session?</h3>
          <p>Are you sure you want to disconnect? You will lose connection to the current peer.</p>
          <div className="confirm-actions">
            <button id="leaveCancelBtn" className="confirm-btn">
              Cancel
            </button>
            <button id="leaveConfirmBtn" className="confirm-btn danger">
              Leave Room
            </button>
          </div>
        </div>
      </div>

      <div
        id="clearModal"
        className="confirm-modal hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="clearModalTitle"
        aria-hidden="true"
      >
        <div className="confirm-backdrop" data-confirm-close="1"></div>
        <div className="confirm-card">
          <h3 id="clearModalTitle">Clear Chat?</h3>
          <p>
            This will permanently delete all messages and files from your screen. This action cannot
            be undone.
          </p>
          <div className="confirm-actions">
            <button id="clearCancelBtn" className="confirm-btn">
              Cancel
            </button>
            <button id="clearConfirmBtn" className="confirm-btn danger">
              Clear History
            </button>
          </div>
        </div>
      </div>

      <div id="infoPanelBackdrop" className="info-panel-backdrop hidden"></div>
      <aside id="roomInfoPanel" className="room-info-panel hidden" aria-hidden="true">
        <div className="room-info-head">
          <h3>Room Info</h3>
          <button id="roomInfoClose" className="icon-btn" aria-label="Close room info panel">
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className="room-info-body">
          <div className="room-info-card">
            <div className="logo" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
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
            <div>
              <div className="muted">Room Code</div>
              <code id="roomInfoCode" className="room-id">
                ———
              </code>
            </div>
          </div>
          <div className="room-participants">
            <span className="muted">Participants</span>
            <strong id="participantsCount">1</strong>
          </div>
          <ul id="participantsList" className="participants-list"></ul>
        </div>
      </aside>

      <div id="nebulaToastStack" className="nebula-toast-stack" aria-live="polite"></div>
    </>
  );
}
