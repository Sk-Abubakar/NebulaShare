const ADMIN_SESSION_KEY = "nebula_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;

type SessionPayload = {
  iat: number;
  exp: number;
  nonce: string;
};

type SessionToken = {
  payload: SessionPayload;
  sig: string;
};

const te = new TextEncoder();
const td = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(input: string): Uint8Array {
  const b64 = input
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(input.length / 4) * 4, "=");
  const raw = atob(b64);
  return new Uint8Array(Array.from(raw).map((c) => c.charCodeAt(0)));
}

async function hmac(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    te.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, te.encode(value));
  return toBase64Url(new Uint8Array(sig));
}

function readSecret(): string {
  const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD;
  if (!adminPassword) return "";
  const salt = import.meta.env.VITE_ADMIN_SESSION_SALT || "nebula-admin-v1";
  return `${adminPassword}:${salt}`;
}

async function createSignature(payload: SessionPayload): Promise<string> {
  return hmac(readSecret(), JSON.stringify(payload));
}

export async function createAdminSessionToken(): Promise<string | null> {
  if (!readSecret()) return null;
  const now = Date.now();
  const payload: SessionPayload = {
    iat: now,
    exp: now + SESSION_TTL_MS,
    nonce: crypto.randomUUID(),
  };
  const sig = await createSignature(payload);
  const token: SessionToken = { payload, sig };
  return toBase64Url(te.encode(JSON.stringify(token)));
}

export async function verifyAdminSessionToken(token: string | null): Promise<boolean> {
  if (!token || !readSecret()) return false;
  try {
    const parsed = JSON.parse(td.decode(fromBase64Url(token))) as SessionToken;
    if (!parsed?.payload || !parsed?.sig) return false;
    if (Date.now() > parsed.payload.exp) return false;
    const expected = await createSignature(parsed.payload);
    return parsed.sig === expected;
  } catch {
    return false;
  }
}

export async function hasValidAdminSession(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  return verifyAdminSessionToken(window.localStorage.getItem(ADMIN_SESSION_KEY));
}

export async function setAdminSession() {
  if (typeof window === "undefined") return false;
  const token = await createAdminSessionToken();
  if (!token) return false;
  window.localStorage.setItem(ADMIN_SESSION_KEY, token);
  return true;
}

export function clearAdminSession() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ADMIN_SESSION_KEY);
}
