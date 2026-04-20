(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const chatEl = $("chat");
  let typingEl = $("typing");
  const msgInput = $("msgInput");
  const sendBtn = $("sendBtn");
  const attachBtn = $("attachBtn");
  const fileInput = $("fileInput");
  const burnBtn = $("burnBtn");
  const micBtn = $("micBtn");
  const aiToggle = $("aiToggle");
  const aiFab = $("aiFab");
  const dropOv = $("dropOverlay");
  const roomIdEl = $("roomId");
  const copyRoom = $("copyRoom");
  const connState = $("connState");
  const connLabel = $("connLabel");
  const imgCanvas = $("imgCanvas");
  const peerTarget = $("peerTarget");
  const connectPeer = $("connectPeer");
  const clearChatBtn = $("clearChatBtn");
  const leaveRoomBtn = $("leaveRoom");
  const leaveModal = $("leaveModal");
  const clearModal = $("clearModal");
  const leaveCancelBtn = $("leaveCancelBtn");
  const leaveConfirmBtn = $("leaveConfirmBtn");
  const clearCancelBtn = $("clearCancelBtn");
  const clearConfirmBtn = $("clearConfirmBtn");
  const roomInfoTrigger = $("roomInfoTrigger");
  const roomInfoPanel = $("roomInfoPanel");
  const roomInfoClose = $("roomInfoClose");
  const roomInfoCode = $("roomInfoCode");
  const participantsCount = $("participantsCount");
  const participantsList = $("participantsList");
  const infoPanelBackdrop = $("infoPanelBackdrop");
  const toastStack = $("nebulaToastStack");

  const LOCAL_ID_KEY = "nebula_local_id";
  const REMOTE_ID_KEY = "nebula_remote_id";

  // ── Safe Storage (Incognito / strict-mode compatible) ──────────────────────
  // Falls back to an in-memory Map when localStorage is blocked or throws
  // (common in Private/Incognito tabs and certain iOS WebView environments).
  const _memStore = new Map();
  const safeStorage = {
    getItem(key) {
      try {
        return localStorage.getItem(key);
      } catch (_) {
        return _memStore.get(key) ?? null;
      }
    },
    setItem(key, value) {
      try {
        localStorage.setItem(key, value);
      } catch (_) {
        _memStore.set(key, value);
      }
    },
    removeItem(key) {
      try {
        localStorage.removeItem(key);
      } catch (_) {
        _memStore.delete(key);
      }
    },
  };
  // ──────────────────────────────────────────────────────────────────────────

  // ── Short Room-ID generator ────────────────────────────────────────────────
  // Produces a 6-character uppercase alphanumeric code (e.g. "A9X4BQ").
  // 36^6 ≈ 2.2 billion unique values — more than enough for a public signalling
  // server whilst still being human-readable and easy to share.
  function generateShortId() {
    const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let id = "";
    const arr = new Uint8Array(6);
    crypto.getRandomValues(arr);
    for (const byte of arr) id += CHARS[byte % CHARS.length];
    return id;
  }
  // ──────────────────────────────────────────────────────────────────────────

  const state = {
    roomId: "",
    aiMode: false,
    burnMode: false,
    incoming: new Map(),
    peer: null,
    conn: null,
    reconnectTo: "",
    reconnectTimer: null,
    reconnectAttempt: 0,
    isLeaving: false,
    seenPackets: new Set(),
    pendingAcks: new Map(),
    resendTimer: null,
    filesShared: 0,
    dataTransferredBytes: 0,
    activeConnections: 0,
    connections: [],
    infoPanelOpen: false,
    recorder: null,
    recStart: 0,
    recTimer: null,
  };

  function emitMetrics() {
    window.dispatchEvent(
      new CustomEvent("nebula:metrics", {
        detail: {
          filesShared: state.filesShared,
          dataTransferredBytes: state.dataTransferredBytes,
          activeConnections: state.activeConnections,
        },
      }),
    );
  }

  function showToast(text) {
    if (!toastStack) return;
    const toast = document.createElement("div");
    toast.className = "nebula-toast";
    toast.textContent = text;
    toastStack.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(6px)";
      setTimeout(() => toast.remove(), 180);
    }, 2200);
  }

  function syncRoomInfo() {
    if (roomInfoCode) roomInfoCode.textContent = state.roomId || "———";
    const peers = state.connections;
    if (participantsCount) participantsCount.textContent = String(1 + peers.length);
    if (!participantsList) return;

    const rows = [{ label: "You" }, ...peers.map((id) => ({ label: `Peer: ${id}` }))];
    participantsList.innerHTML = "";
    rows.forEach((row) => {
      const li = document.createElement("li");
      li.className = "participant-item";
      li.innerHTML = `
        <span class="participant-name">${escapeHtml(row.label)}</span>
        <span class="participant-state"><i class="dot"></i>Online</span>
      `;
      participantsList.appendChild(li);
    });
  }

  function setInfoPanel(open) {
    state.infoPanelOpen = open;
    if (!roomInfoPanel || !infoPanelBackdrop) return;
    roomInfoPanel.classList.toggle("hidden", !open);
    infoPanelBackdrop.classList.toggle("hidden", !open);
    roomInfoPanel.setAttribute("aria-hidden", String(!open));
    if (open) syncRoomInfo();
  }

  function safeConnectToPeer(peerId) {
    try {
      connectToPeer(peerId);
    } catch (err) {
      const message = String(err?.message || err || "Connection failed");
      setConn("error", "Connection error");
      addBubble({ kind: "in", html: `Connection error: ${escapeHtml(message)}`, sender: "System" });
    }
  }

  function fmtBytes(b) {
    if (!b) return "0 B";
    const u = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return `${(b / Math.pow(1024, i)).toFixed(i ? 1 : 0)} ${u[i]}`;
  }
  function nowLabel() {
    return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }
  function setConn(stateName, label) {
    connState.className = `badge state state-${stateName}`;
    connLabel.textContent = label;
  }
  function escapeHtml(s) {
    return s.replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  }
  function scrollDown() {
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  function addBubble({ kind = "in", html, meta, sender, fileMeta }) {
    const b = document.createElement("div");
    b.className = `bubble ${kind} pop`;
    if (state.burnMode && kind === "out") b.classList.add("burning");

    if (fileMeta) {
      b.classList.add("file");
      b.innerHTML = `
        <div class="file-ico">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
          </svg>
        </div>
        <div class="file-info">
          <div class="file-name"></div>
          <div class="file-size"></div>
          <div class="progress"><i></i></div>
        </div>`;
      b.querySelector(".file-name").textContent = fileMeta.name;
      b.querySelector(".file-size").textContent = fmtBytes(fileMeta.size);
    } else {
      b.innerHTML = `<div class="text"></div><div class="meta"></div>`;
      b.querySelector(".text").innerHTML = html || "";
    }

    const metaEl = b.querySelector(".meta");
    if (metaEl)
      metaEl.textContent = `${sender || (kind === "out" ? "You" : kind === "ai" ? "AI" : "Peer")} · ${meta || nowLabel()}`;
    chatEl.insertBefore(b, typingEl);
    scrollDown();
    if (state.burnMode && kind === "out") scheduleBurn(b);
    return b;
  }

  function addImageBubble({ kind, blob, name }) {
    const b = document.createElement("div");
    b.className = `bubble ${kind} image pop`;
    if (state.burnMode && kind === "out") b.classList.add("burning");
    const url = URL.createObjectURL(blob);
    b.innerHTML = `<img alt="${name || "image"}" /><div class="meta"></div>`;
    b.querySelector("img").src = url;
    b.querySelector(".meta").textContent = `${kind === "out" ? "You" : "Peer"} · ${nowLabel()}`;
    chatEl.insertBefore(b, typingEl);
    scrollDown();
    if (state.burnMode && kind === "out") scheduleBurn(b);
  }

  function addVoiceBubble({ kind, blob, durationMs, sizeBytes }) {
    const b = document.createElement("div");
    b.className = `bubble ${kind} voice pop`;
    if (state.burnMode && kind === "out") b.classList.add("burning");
    const url = URL.createObjectURL(blob);
    const dur = formatDuration(durationMs);
    const size = sizeBytes ? fmtBytes(sizeBytes) : fmtBytes(blob.size);
    b.innerHTML = `
      <div class="voice-row">
        <div class="voice-ico">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/>
          </svg>
        </div>
        <audio controls preload="metadata"></audio>
      </div>
      <div class="meta"></div>`;
    b.querySelector("audio").src = url;
    b.querySelector(".meta").textContent =
      `${kind === "out" ? "You" : "Peer"} · ${dur} · ${size} · ${nowLabel()}`;
    chatEl.insertBefore(b, typingEl);
    scrollDown();
    if (state.burnMode && kind === "out") scheduleBurn(b);
  }

  function formatDuration(ms) {
    if (!ms || !isFinite(ms)) return "0:00";
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  function scheduleBurn(node) {
    setTimeout(() => {
      node.classList.add("fade-out");
      setTimeout(() => node.remove(), 400);
    }, 30000);
  }
  function showTyping(on) {
    typingEl.classList.toggle("hidden", !on);
    if (on) scrollDown();
  }
  function scheduleResend(entry) {
    if (!entry || entry.sent >= 3) return;
    if (!state.conn || !state.conn.open) return;
    if (Date.now() - entry.ts < 1200) return;
    state.conn.send(entry.packet);
    entry.ts = Date.now();
    entry.sent += 1;
  }
  function packet(type, payload = {}) {
    return { ...payload, type, _id: crypto.randomUUID() };
  }
  function sendPacket(packet) {
    if (!state.conn || !state.conn.open) return false;
    state.conn.send(packet);
    if (
      packet?._id &&
      packet.type !== "ack" &&
      packet.type !== "typing" &&
      packet.type !== "file-chunk"
    ) {
      state.pendingAcks.set(packet._id, { packet, ts: Date.now(), sent: 0 });
    }
    return true;
  }

  function bindConn(conn) {
    // Close the previous connection ONLY if it belongs to a different peer.
    if (state.conn && state.conn !== conn) {
      try { state.conn.close(); } catch (_) {}
    }
    // Stamp this connection with a unique ID so stale event callbacks from
    // a previous (already-closed) connection cannot corrupt state.
    const connId = crypto.randomUUID();
    conn.__nebulaId = connId;

    // Track whether the handshake actually completed.  This lets close-handler
    // distinguish "failed to open" from "opened then dropped" so we only
    // schedule auto-reconnect for real live sessions that dropped mid-flight.
    let wasOpened = false;

    state.conn = conn;
    state.reconnectTo = conn.peer;
    state.reconnectAttempt = 0;
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    if (peerTarget) peerTarget.value = conn.peer;
    setConn("connecting", `Connecting to ${conn.peer.slice(0, 6)}…`);

    // ─ 10-second open timeout ────────────────────────────────────────────
    // If ICE gathering / DTLS handshake stalls we abort the specific
    // DataConnection and reset the UI gracefully WITHOUT touching the local
    // Peer instance or its Room Code — the user can simply try again.
    let openTimeout = setTimeout(() => {
      if (state.conn?.__nebulaId !== connId) return; // already superseded
      if (conn.open) return;                         // already succeeded
      console.warn("[NebulaShare] connection open-timeout for", conn.peer);
      try { conn.close(); } catch (_) {}
      if (state.conn?.__nebulaId === connId) state.conn = null;
      setConn("idle", "Waiting for peer");
      showToast("🛑 Failed to connect. The room might be offline or invalid.");
      addBubble({
        kind: "in",
        html: "Connection timed out — the room may be offline or the code is invalid.",
        sender: "System",
      });
      // Do NOT call scheduleReconnect() here: this was an initial join
      // attempt, not a dropped live session.
    }, 10000);

    conn.on("open", () => {
      clearTimeout(openTimeout);
      // Ignore if a newer connection has already taken over.
      if (state.conn?.__nebulaId !== connId) return;
      wasOpened = true;
      setConn("connected", "Connected 🟢");
      state.activeConnections = 1;
      state.connections = [conn.peer];
      safeStorage.setItem(REMOTE_ID_KEY, conn.peer);
      if (state.roomId) safeStorage.setItem(LOCAL_ID_KEY, state.roomId);
      syncRoomInfo();
      emitMetrics();
    });
    conn.on("data", (msg) => {
      if (state.conn?.__nebulaId !== connId) return;
      receivePacket(msg);
    });
    conn.on("close", () => {
      clearTimeout(openTimeout);
      // Only react if this connection is still the active one.
      if (state.conn?.__nebulaId !== connId) return;
      state.conn = null;
      state.activeConnections = 0;
      state.connections = [];
      syncRoomInfo();
      emitMetrics();
      if (wasOpened) {
        // Live session dropped mid-flight — try to reconnect.
        setConn("idle", "Waiting for peer");
        if (!state.isLeaving) {
          addBubble({ kind: "in", html: "Peer disconnected.", sender: "System" });
          scheduleReconnect();
        }
      } else {
        // Never successfully opened — just reset silently (the timeout
        // toast already fired or the error handler will fire next).
        setConn("idle", "Waiting for peer");
      }
    });
    conn.on("error", (err) => {
      clearTimeout(openTimeout);
      if (state.conn?.__nebulaId !== connId) return;
      // Verbose logging for cross-browser debugging.
      console.error("[NebulaShare] conn error — type:", err?.type, "| message:", err?.message, err);
      // Kill only the failed DataConnection; the local Peer stays alive.
      try { conn.close(); } catch (_) {}
      if (state.conn?.__nebulaId === connId) state.conn = null;
      setConn("idle", "Waiting for peer");
      showToast("🛑 Failed to connect. The room might be offline or invalid.");
      addBubble({
        kind: "in",
        html: `Failed to connect [${escapeHtml(String(err?.type || "unknown"))}]: ${escapeHtml(String(err?.message || err))}`,
        sender: "System",
      });
    });
  }

  function connectToPeer(peerIdInput) {
    const peerId = (peerIdInput || peerTarget?.value || "").trim().toUpperCase();
    if (!peerId || !state.peer) return;
    if (peerId === state.roomId) {
      addBubble({ kind: "in", html: "Enter a different Room Code.", sender: "System" });
      return;
    }
    // Cancel any in-flight auto-reconnect so it doesn't race this manual attempt.
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    state.reconnectAttempt = 0;
    const conn = state.peer.connect(peerId, { reliable: true, serialization: "binary" });
    bindConn(conn);
  }
  function scheduleReconnect() {
    if (state.isLeaving || !state.peer || !state.reconnectTo) return;
    if (state.reconnectAttempt >= 3) return;
    const wait = 1200 * (state.reconnectAttempt + 1);
    state.reconnectAttempt += 1;
    setConn("connecting", `Reconnecting (${state.reconnectAttempt}/3)...`);
    state.reconnectTimer = setTimeout(() => {
      if (!state.peer || state.conn?.open) return;
      safeConnectToPeer(state.reconnectTo);
    }, wait);
  }

  function restoreConnectionTargets() {
    const localId = safeStorage.getItem(LOCAL_ID_KEY) || "";
    const remoteId = safeStorage.getItem(REMOTE_ID_KEY) || "";
    return { localId, remoteId };
  }

  function attemptAutoReconnect(notify = false) {
    const { localId, remoteId } = restoreConnectionTargets();
    if (!remoteId || !state.peer || state.conn?.open) return;
    if (localId && state.roomId && localId !== state.roomId) return;
    safeConnectToPeer(remoteId);
    if (notify) showToast("Reconnected 🟢");
  }

  // ── ICE / STUN configuration ──────────────────────────────────────────────
  // Kept intentionally minimal: more STUN servers slow ICE gathering because
  // the browser must query all of them simultaneously.  Google's primary pair
  // is universally reachable and well-maintained across all platforms.
  const ICE_CONFIG = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
    ],
  };
  // ──────────────────────────────────────────────────────────────────────────

  function bootPeer() {
    if (!window.Peer) {
      setConn("error", "PeerJS unavailable");
      addBubble({ kind: "in", html: "PeerJS did not load.", sender: "System" });
      return;
    }
    // Guard against React 18 Strict Mode double-invocation or any other
    // scenario that calls bootPeer() twice before the first Peer is destroyed.
    if (state.peer) return;

    // Always use an explicit short ID so the room code is human-readable.
    // Reuse the saved ID (same tab / page refresh) so the room code stays
    // stable for the current session; generate a fresh one otherwise.
    const { localId } = restoreConnectionTargets();
    const isValidShortId = localId && /^[A-Z0-9]{4,12}$/.test(localId);
    const chosenId = isValidShortId ? localId : generateShortId();

    const peerOpts = { config: ICE_CONFIG };
    state.peer = new window.Peer(chosenId, peerOpts);

    state.peer.on("open", (id) => {
      state.roomId = id;
      if (roomIdEl) roomIdEl.textContent = id;
      safeStorage.setItem(LOCAL_ID_KEY, id);
      syncRoomInfo();
      setConn("idle", "Waiting for peer");
      attemptAutoReconnect(false);
    });
    state.peer.on("connection", (conn) => {
      // An incoming connection from a remote peer: cancel any pending
      // auto-reconnect so the two don't step on each other.
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
      }
      bindConn(conn);
    });
    state.peer.on("disconnected", () => {
      // The signalling server dropped us (network hiccup). Reconnect to it
      // without destroying the Peer object so existing data channels survive.
      if (!state.isLeaving && state.peer && !state.peer.destroyed) {
        try { state.peer.reconnect(); } catch (_) {}
      }
    });
    state.peer.on("error", (err) => {
      const msg = String(err?.message || err);
      // Verbose logging for cross-browser debugging.
      console.error("[NebulaShare] peer error — type:", err?.type, "| message:", msg, err);

      // "ID taken" on the signalling server — our chosen short-code is already
      // registered.  Destroy the current (unusable) Peer cleanly, then retry
      // with a fresh code.  Critically we do NOT clear LOCAL_ID_KEY here so
      // that we only fall into this path once; bootPeer() will generate a new
      // ID and overwrite the stored one when the new Peer opens.
      if (err.type === "unavailable-id") {
        console.warn("[NebulaShare] short ID unavailable, retrying with a new code…");
        const oldPeer = state.peer;
        state.peer = null;          // clear first so bootPeer() guard passes
        safeStorage.removeItem(LOCAL_ID_KEY);
        try { oldPeer.destroy(); } catch (_) {}
        bootPeer();
        return;
      }

      // "peer-unavailable" means the *remote* peer we tried to reach doesn't
      // exist on the signalling server.  This should NOT affect our local Peer
      // instance at all — just surface a user-friendly message.
      if (err.type === "peer-unavailable") {
        // Clean up the stale outgoing connection if one exists.
        if (state.conn && !state.conn.open) {
          try { state.conn.close(); } catch (_) {}
          state.conn = null;
        }
        setConn("idle", "Waiting for peer");
        showToast("🛑 Failed to connect. The room might be offline or invalid.");
        addBubble({
          kind: "in",
          html: "Room not found — the code may be wrong or the host has left.",
          sender: "System",
        });
        return;
      }

      // All other peer-level errors: surface them but keep the Peer alive.
      setConn("error", "Peer error");
      addBubble({
        kind: "in",
        html: `Peer error [${escapeHtml(String(err?.type || "unknown"))}]: ${escapeHtml(msg)}`,
        sender: "System",
      });
    });
  }

  function sendText() {
    const v = msgInput.value.trim();
    if (!v) return;
    if (state.aiMode) {
      addBubble({ kind: "out", html: escapeHtml(v) });
      msgInput.value = "";
      autoResize();
      void askAI(v)
        .then((reply) => addBubble({ kind: "ai", html: reply }))
        .catch((err) =>
          addBubble({
            kind: "in",
            html: `AI request failed: ${escapeHtml(String(err?.message || err))}`,
            sender: "System",
          }),
        );
      return;
    }
    addBubble({ kind: "out", html: escapeHtml(v) });
    msgInput.value = "";
    autoResize();
    if (!sendPacket(packet("msg", { text: v }))) {
      addBubble({ kind: "in", html: "Peer is not connected.", sender: "System" });
    }
  }

  async function askAI(text) {
    showTyping(true);
    try {
      const bubbles = Array.from(chatEl.querySelectorAll(".bubble .text")).slice(-10);
      const context = bubbles
        .map((el) => {
          const bubble = el.closest(".bubble");
          return {
            role: bubble?.classList.contains("ai") ? "assistant" : "user",
            content: el.textContent || "",
          };
        })
        .filter((m) => m.content.trim().length > 0);

      if (window.NebulaAI?.ask) {
        const reply = await window.NebulaAI.ask(context, text);
        return escapeHtml(reply);
      }
      return "AI is not configured. Add VITE_GEMINI_API_KEY to your environment.";
    } catch (err) {
      return `AI request failed: ${escapeHtml(String(err?.message || err))}`;
    } finally {
      showTyping(false);
    }
  }

  const CHUNK_SIZE = 64 * 1024;
  async function handleFiles(files) {
    for (const file of files) {
      if (file.type.startsWith("image/")) {
        const compressed = await compressImage(file);
        addImageBubble({ kind: "out", blob: compressed, name: file.name });
        await sendFile(new File([compressed], file.name, { type: compressed.type }));
      } else {
        const bubble = addBubble({ kind: "out", fileMeta: { name: file.name, size: file.size } });
        await sendFile(file, bubble);
      }
    }
  }

  async function compressImage(file, maxW = 1600, quality = 0.82) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxW / img.width);
        imgCanvas.width = Math.round(img.width * scale);
        imgCanvas.height = Math.round(img.height * scale);
        const ctx = imgCanvas.getContext("2d");
        ctx.drawImage(img, 0, 0, imgCanvas.width, imgCanvas.height);
        imgCanvas.toBlob((b) => resolve(b || file), "image/jpeg", quality);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }

  async function sendFile(file, bubble, extraMeta) {
    if (!state.conn || !state.conn.open) {
      addBubble({ kind: "in", html: "Peer is not connected.", sender: "System" });
      return;
    }

    const fileId = crypto.randomUUID();
    sendPacket(
      packet("file-meta", {
        fileId,
        name: file.name,
        size: file.size,
        mime: file.type,
        ...(extraMeta || {}),
      }),
    );
    state.filesShared += 1;
    emitMetrics();

    const bytes = new Uint8Array(await file.arrayBuffer());
    let sent = 0;
    for (let off = 0; off < bytes.byteLength; off += CHUNK_SIZE) {
      const slice = bytes.slice(off, Math.min(off + CHUNK_SIZE, bytes.byteLength));
      sendPacket(packet("file-chunk", { fileId, data: slice.buffer }));
      sent += slice.byteLength;
      state.dataTransferredBytes += slice.byteLength;
      if (bubble) {
        const bar = bubble.querySelector(".progress > i");
        if (bar) bar.style.width = ((sent / file.size) * 100).toFixed(1) + "%";
      }
    }
    sendPacket(packet("file-end", { fileId }));
    emitMetrics();
  }

  function receivePacket(msg) {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "ack" && msg.ackId) {
      state.pendingAcks.delete(msg.ackId);
      return;
    }
    if (msg._id) {
      if (state.seenPackets.has(msg._id)) return;
      state.seenPackets.add(msg._id);
      if (state.seenPackets.size > 1200) {
        const [oldest] = state.seenPackets;
        state.seenPackets.delete(oldest);
      }
      sendPacket({ type: "ack", ackId: msg._id });
    }
    if (msg.type === "file-meta") {
      const bubble = addBubble({ kind: "in", fileMeta: { name: msg.name, size: msg.size } });
      state.incoming.set(msg.fileId, { meta: msg, chunks: [], received: 0, bubble });
      return;
    }
    if (msg.type === "file-chunk") {
      const e = state.incoming.get(msg.fileId);
      if (!e) return;
      const chunk =
        msg.data instanceof ArrayBuffer
          ? new Uint8Array(msg.data)
          : new Uint8Array(msg.data?.data || []);
      e.chunks.push(chunk);
      e.received += chunk.byteLength;
      state.dataTransferredBytes += chunk.byteLength;
      const bar = e.bubble.querySelector(".progress > i");
      if (bar) bar.style.width = ((e.received / e.meta.size) * 100).toFixed(1) + "%";
      return;
    }
    if (msg.type === "file-end") {
      const e = state.incoming.get(msg.fileId);
      if (!e) return;
      // Assemble blob but do NOT auto-download — hold it in memory until user accepts.
      const blob = new Blob(e.chunks, { type: e.meta.mime || "application/octet-stream" });
      const mime = e.meta.mime || "";
      state.incoming.delete(msg.fileId);

      // Images and voice notes are inline previews — show them immediately.
      if (mime.startsWith("image/")) {
        e.bubble.remove();
        addImageBubble({ kind: "in", blob, name: e.meta.name });
        return;
      }
      if (mime.startsWith("audio/")) {
        e.bubble.remove();
        addVoiceBubble({ kind: "in", blob, durationMs: e.meta.durationMs, sizeBytes: e.meta.size });
        return;
      }

      // ── Secure Accept / Reject permission flow for binary file transfers ───
      // The blob is kept in memory; nothing is written to disk until the
      // user explicitly clicks Accept.
      const senderId = state.conn?.peer ? state.conn.peer.slice(0, 10) + "…" : "Peer";
      showFilePermissionPrompt({
        senderId,
        fileName: e.meta.name,
        fileSize: e.meta.size,
        blob,
        bubble: e.bubble,
      });
      return;
    }
    if (msg.type === "msg") {
      addBubble({ kind: "in", html: escapeHtml(msg.text) });
      return;
    }
    if (msg.type === "typing") showTyping(!!msg.on);
  }

  function autoResize() {
    msgInput.style.height = "auto";
    msgInput.style.height = `${Math.min(msgInput.scrollHeight, 140)}px`;
  }
  msgInput.addEventListener("input", () => {
    autoResize();
    sendPacket({ type: "typing", on: msgInput.value.length > 0 });
  });
  msgInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  });
  sendBtn.addEventListener("click", sendText);
  attachBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (e) => {
    if (e.target.files?.length) handleFiles(e.target.files);
    fileInput.value = "";
  });
  if (connectPeer) connectPeer.addEventListener("click", () => connectToPeer());
  if (peerTarget) {
    peerTarget.addEventListener("keydown", (e) => {
      if (e.key === "Enter") connectToPeer();
    });
  }

  function openModal(modal) {
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }
  function closeModal(modal) {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }
  function clearChatSurface() {
    chatEl.innerHTML = "";
    const day = document.createElement("div");
    day.className = "day-divider";
    day.innerHTML = "<span>Today</span>";
    chatEl.appendChild(day);
    typingEl = document.createElement("div");
    typingEl.id = "typing";
    typingEl.className = "bubble in typing hidden";
    typingEl.setAttribute("aria-hidden", "true");
    typingEl.innerHTML = '<div class="dots"><span></span><span></span><span></span></div>';
    chatEl.appendChild(typingEl);
  }
  // ── File Permission Prompt ─────────────────────────────────────────────────
  // Shows a focused toast with Accept / Reject buttons. The blob lives only in
  // RAM; it is never written to disk unless the user explicitly accepts.
  function showFilePermissionPrompt({ senderId, fileName, fileSize, blob, bubble }) {
    if (!toastStack) return;

    const toast = document.createElement("div");
    toast.className = "nebula-toast file-permission-toast";
    toast.setAttribute("role", "dialog");
    toast.setAttribute("aria-label", "Incoming file transfer request");
    toast.innerHTML = `
      <div class="fp-header">
        <svg class="fp-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
        <span class="fp-title">Incoming File</span>
      </div>
      <p class="fp-body">
        <strong class="fp-peer">${escapeHtml(senderId)}</strong> wants to send you
        <em class="fp-filename">${escapeHtml(fileName)}</em>
        <span class="fp-size">(${fmtBytes(fileSize)})</span>
      </p>
      <div class="fp-actions">
        <button class="fp-accept" data-action="accept" aria-label="Accept file transfer">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
          Accept
        </button>
        <button class="fp-reject" data-action="reject" aria-label="Reject file transfer">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Reject
        </button>
      </div>`;

    const dismiss = () => {
      toast.style.opacity = "0";
      toast.style.transform = "translateY(6px)";
      setTimeout(() => toast.remove(), 180);
    };

    toast.querySelector("[data-action='accept']").addEventListener("click", () => {
      // Only now do we create the object URL and trigger browser download.
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Revoke after a short delay so the browser can pick it up.
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      // Update the in-chat bubble to reflect receipt.
      if (bubble) {
        const info = bubble.querySelector(".file-info");
        if (info) {
          info.innerHTML = `
            <div class="file-name">${escapeHtml(fileName)}</div>
            <div class="file-size">${fmtBytes(fileSize)} · downloaded</div>`;
        }
      }
      showToast(`✅ Downloading ${escapeHtml(fileName)}`);
      dismiss();
    });

    toast.querySelector("[data-action='reject']").addEventListener("click", () => {
      // Discard the blob from memory to prevent leaks.
      // (No URL was ever created, so no revoke needed.)
      if (bubble) bubble.remove();
      showToast(`🚫 Rejected ${escapeHtml(fileName)}`);
      dismiss();
    });

    toastStack.appendChild(toast);
    // Auto-dismiss after 60 s if the user ignores it, and discard the blob.
    setTimeout(() => {
      if (toast.isConnected) {
        if (bubble) bubble.remove();
        dismiss();
      }
    }, 60000);
  }
  // ──────────────────────────────────────────────────────────────────────────

  function leaveSession() {
    state.isLeaving = true;
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    if (state.conn?.open) state.conn.close();
    if (state.peer && typeof state.peer.destroy === "function") state.peer.destroy();
    state.conn = null;
    state.activeConnections = 0;
    state.connections = [];
    state.peer = null;
    safeStorage.removeItem(LOCAL_ID_KEY);
    safeStorage.removeItem(REMOTE_ID_KEY);
    syncRoomInfo();
    emitMetrics();
    state.incoming.clear();
    state.pendingAcks.clear();
    clearChatSurface();
    if (peerTarget) peerTarget.value = "";
    setConn("idle", "Waiting for peer");
    setInfoPanel(false);
    state.isLeaving = false;

    // Signal React to reset room state and navigate back to the landing page.
    if (typeof window.NebulaLeave === "function") {
      window.NebulaLeave();
    }
  }

  if (leaveRoomBtn) leaveRoomBtn.addEventListener("click", () => openModal(leaveModal));
  if (clearChatBtn) clearChatBtn.addEventListener("click", () => openModal(clearModal));
  if (leaveCancelBtn) leaveCancelBtn.addEventListener("click", () => closeModal(leaveModal));
  if (clearCancelBtn) clearCancelBtn.addEventListener("click", () => closeModal(clearModal));
  if (leaveConfirmBtn) {
    leaveConfirmBtn.addEventListener("click", () => {
      leaveSession();
      closeModal(leaveModal);
    });
  }
  if (clearConfirmBtn) {
    clearConfirmBtn.addEventListener("click", () => {
      clearChatSurface();
      closeModal(clearModal);
    });
  }
  document.querySelectorAll("[data-confirm-close]").forEach((el) => {
    el.addEventListener("click", () => {
      closeModal(leaveModal);
      closeModal(clearModal);
    });
  });

  if (roomInfoTrigger) {
    roomInfoTrigger.addEventListener("click", () => setInfoPanel(!state.infoPanelOpen));
    roomInfoTrigger.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setInfoPanel(!state.infoPanelOpen);
      }
    });
  }
  if (roomInfoClose) roomInfoClose.addEventListener("click", () => setInfoPanel(false));
  if (infoPanelBackdrop) infoPanelBackdrop.addEventListener("click", () => setInfoPanel(false));

  burnBtn.addEventListener("click", () => {
    state.burnMode = !state.burnMode;
    burnBtn.setAttribute("aria-pressed", state.burnMode);
    addBubble({
      kind: "in",
      html: state.burnMode
        ? "🔥 Self-destruct enabled — your next messages vanish in 30s."
        : "Self-destruct disabled.",
      sender: "System",
    });
  });

  function setAi(on) {
    state.aiMode = on;
    aiToggle.setAttribute("aria-pressed", on);
    msgInput.placeholder = on ? "Ask the AI assistant…" : "Type a message…";
  }
  aiToggle.addEventListener("click", () => setAi(!state.aiMode));
  aiFab.addEventListener("click", () => {
    setAi(true);
    msgInput.focus();
  });

  copyRoom.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(state.roomId || "");
      const orig = copyRoom.innerHTML;
      copyRoom.innerHTML = "✓";
      setTimeout(() => (copyRoom.innerHTML = orig), 1200);
    } catch (_) {}
  });

  const qrBtn = $("qrBtn");
  const qrModal = $("qrModal");
  const qrSvg = $("qrSvg");
  const qrUrl = $("qrUrl");
  const qrClose = $("qrClose");
  const qrCopy = $("qrCopy");

  function openQr() {
    if (!qrModal) return;
    const url = location.href;
    qrUrl.textContent = url;
    if (window.NebulaQR && qrSvg) {
      try {
        window.NebulaQR.renderSVG(url, qrSvg, {
          ecl: "M",
          margin: 2,
          dark: "#0a0c1a",
          light: "#ffffff",
        });
      } catch (e) {
        qrSvg.innerHTML = `<text x="10" y="40" fill="#f87171" font-size="12">QR error: ${escapeHtml(String(e.message || e))}</text>`;
      }
    }
    qrModal.classList.remove("hidden");
    qrModal.setAttribute("aria-hidden", "false");
  }
  function closeQr() {
    if (!qrModal) return;
    qrModal.classList.add("hidden");
    qrModal.setAttribute("aria-hidden", "true");
  }
  if (qrBtn) qrBtn.addEventListener("click", openQr);
  if (qrClose) qrClose.addEventListener("click", closeQr);
  if (qrModal) {
    qrModal.addEventListener("click", (e) => {
      if (e.target instanceof Element && e.target.dataset.close) closeQr();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && qrModal && !qrModal.classList.contains("hidden")) closeQr();
  });
  if (qrCopy) {
    qrCopy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        const orig = qrCopy.innerHTML;
        qrCopy.innerHTML = "✓";
        setTimeout(() => (qrCopy.innerHTML = orig), 1200);
      } catch (_) {}
    });
  }

  const qrDownload = $("qrDownload");
  if (qrDownload) {
    qrDownload.addEventListener("click", () => {
      if (!qrSvg) return;
      const targetSize = 1024;
      const xml = new XMLSerializer().serializeToString(qrSvg);
      const svg64 = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
      const img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = targetSize;
        c.height = targetSize;
        const ctx = c.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, targetSize, targetSize);
        ctx.drawImage(img, 0, 0, targetSize, targetSize);
        c.toBlob((blob) => {
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `nebulashare-room-${state.roomId || "peer"}.png`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
          const orig = qrDownload.innerHTML;
          qrDownload.innerHTML = "✓ Downloaded";
          setTimeout(() => (qrDownload.innerHTML = orig), 1400);
        }, "image/png");
      };
      img.onerror = () => {
        addBubble({
          kind: "in",
          html: "⚠️ Couldn't rasterize QR — try copying the link instead.",
          sender: "System",
        });
      };
      img.src = svg64;
    });
  }

  function pickVoiceMime() {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/webm",
      "audio/mp4",
    ];
    for (const m of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) return m;
    }
    return "";
  }

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      addBubble({
        kind: "in",
        html: "⚠️ Microphone API not available in this browser.",
        sender: "System",
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const mimeType = pickVoiceMime();
      const rec = new MediaRecorder(
        stream,
        mimeType ? { mimeType, audioBitsPerSecond: 24000 } : undefined,
      );
      const chunks = [];
      rec.ondataavailable = (ev) => {
        if (ev.data && ev.data.size) chunks.push(ev.data);
      };
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const durationMs = Date.now() - state.recStart;
        const blob = new Blob(chunks, { type: mimeType || "audio/webm" });
        clearInterval(state.recTimer);
        state.recTimer = null;
        state.recorder = null;
        micBtn.setAttribute("aria-pressed", "false");
        micBtn.removeAttribute("data-rec");
        if (blob.size < 800) {
          addBubble({
            kind: "in",
            html: "Recording too short — try holding longer.",
            sender: "System",
          });
          return;
        }
        addVoiceBubble({ kind: "out", blob, durationMs, sizeBytes: blob.size });
        const file = new File([blob], `voice-${Date.now()}.webm`, { type: blob.type });
        await sendFile(file, null, { durationMs });
      };
      state.recorder = rec;
      state.recStart = Date.now();
      rec.start(250);
      micBtn.setAttribute("aria-pressed", "true");
      micBtn.setAttribute("data-rec", "1");
      state.recTimer = setInterval(() => {
        const sec = Math.floor((Date.now() - state.recStart) / 1000);
        micBtn.title = `Recording… ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} (click to stop)`;
        if (sec >= 120) stopRecording();
      }, 250);
    } catch (err) {
      addBubble({
        kind: "in",
        html: `⚠️ Mic access denied: ${escapeHtml(String(err.message || err))}`,
        sender: "System",
      });
    }
  }
  function stopRecording() {
    if (state.recorder && state.recorder.state !== "inactive") state.recorder.stop();
  }
  micBtn.addEventListener("click", () => {
    if (state.recorder) stopRecording();
    else startRecording();
  });

  let dragDepth = 0;
  const onDragEnter = (e) => {
    if (!e.dataTransfer?.types?.includes("Files")) return;
    dragDepth++;
    dropOv.classList.remove("hidden");
  };
  const onDragLeave = () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dropOv.classList.add("hidden");
  };
  const onDragOver = (e) => e.preventDefault();
  const onDrop = (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropOv.classList.add("hidden");
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  };

  const onOffline = () => {
    showToast("Connection lost...");
  };
  const onOnline = () => {
    attemptAutoReconnect(true);
  };

  window.addEventListener("dragenter", onDragEnter);
  window.addEventListener("dragleave", onDragLeave);
  window.addEventListener("dragover", onDragOver);
  window.addEventListener("drop", onDrop);
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);

  function cleanupRuntime() {
    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
      state.reconnectTimer = null;
    }
    if (state.resendTimer) {
      clearInterval(state.resendTimer);
      state.resendTimer = null;
    }
    if (state.recTimer) {
      clearInterval(state.recTimer);
      state.recTimer = null;
    }
    if (state.conn?.open) {
      try {
        state.conn.close();
      } catch (_) {}
    }
    if (state.peer && typeof state.peer.destroy === "function") {
      try {
        state.peer.destroy();
      } catch (_) {}
    }
    window.removeEventListener("dragenter", onDragEnter);
    window.removeEventListener("dragleave", onDragLeave);
    window.removeEventListener("dragover", onDragOver);
    window.removeEventListener("drop", onDrop);
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
  }

  window.NebulaUnmount = cleanupRuntime;

  autoResize();
  syncRoomInfo();
  state.resendTimer = setInterval(() => {
    for (const entry of state.pendingAcks.values()) scheduleResend(entry);
  }, 450);
  setConn("connecting", "Starting peer...");
  emitMetrics();
  bootPeer();
})();
