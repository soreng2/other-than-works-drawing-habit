export const GOOGLE_SESSION_COOKIE = "otw_google_session";
export const GOOGLE_OAUTH_STATE_COOKIE = "otw_google_oauth_state";
export const GOOGLE_SESSION_HEADER = "x-otw-google-session";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export type GoogleSession = {
  provider: "google";
  sub: string;
  email: string;
  name: string;
  exp: number;
};

function base64UrlEncode(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmac(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload)));
}

function sameBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export async function createGoogleSessionToken(user: Omit<GoogleSession, "provider" | "exp">, secret: string) {
  if (secret.length < 32) throw new Error("google_auth_not_configured");
  const session: GoogleSession = {
    provider: "google",
    sub: user.sub,
    email: user.email.trim().toLowerCase(),
    name: user.name.trim() || user.email,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
  };
  const payload = base64UrlEncode(textEncoder.encode(JSON.stringify(session)));
  return `${payload}.${base64UrlEncode(await hmac(payload, secret))}`;
}

export async function verifyGoogleSessionToken(token: string, secret: string | undefined): Promise<GoogleSession | null> {
  if (!secret || secret.length < 32) return null;
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length) return null;
  try {
    const expected = await hmac(payload, secret);
    if (!sameBytes(base64UrlDecode(signature), expected)) return null;
    const session = JSON.parse(textDecoder.decode(base64UrlDecode(payload))) as Partial<GoogleSession>;
    if (session.provider !== "google" || !session.sub || !session.email || !session.name || !session.exp) return null;
    if (session.exp <= Math.floor(Date.now() / 1000)) return null;
    return session as GoogleSession;
  } catch {
    return null;
  }
}

export function requestCookie(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key === name) return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return null;
}

export function googleSessionFromRequest(request: Request, secret: string | undefined) {
  const token = requestCookie(request, GOOGLE_SESSION_COOKIE);
  return token ? verifyGoogleSessionToken(token, secret) : Promise.resolve(null);
}

export function secureCookie(request: Request) {
  return new URL(request.url).protocol === "https:" ? "; Secure" : "";
}

export function cookieHeader(request: Request, name: string, value: string, maxAge: number) {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookie(request)}`;
}
