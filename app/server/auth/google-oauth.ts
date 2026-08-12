import {
  GOOGLE_OAUTH_STATE_COOKIE,
  GOOGLE_SESSION_COOKIE,
  cookieHeader,
  createGoogleSessionToken,
  requestCookie,
} from "./google-session";

export type GoogleAuthEnv = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  AUTH_SESSION_SECRET?: string;
};

const PLATFORM_SIGN_IN_PATH = "/signin-with-chatgpt?return_to=%2F";
const PLATFORM_SIGN_OUT_PATH = "/signout-with-chatgpt?return_to=%2F";

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

export function googleAuthConfigured(env: GoogleAuthEnv): env is Required<GoogleAuthEnv> {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.AUTH_SESSION_SECRET && env.AUTH_SESSION_SECRET.length >= 32);
}

function redirect(request: Request, path: string, cookie?: string) {
  const response = new Response(null, {
    status: 302,
    headers: { location: new URL(path, request.url).href, "cache-control": "no-store" },
  });
  if (cookie) response.headers.append("set-cookie", cookie);
  return response;
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function callbackUrl(request: Request) {
  return new URL("/auth/google/callback", request.url).href;
}

async function startGoogleLogin(request: Request, env: GoogleAuthEnv) {
  if (!googleAuthConfigured(env)) return redirect(request, PLATFORM_SIGN_IN_PATH);
  const state = randomState();
  const authorize = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authorize.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: callbackUrl(request),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  }).toString();
  const response = new Response(null, { status: 302, headers: { location: authorize.href, "cache-control": "no-store" } });
  response.headers.append("set-cookie", cookieHeader(request, GOOGLE_OAUTH_STATE_COOKIE, state, 600));
  return response;
}

async function finishGoogleLogin(request: Request, env: GoogleAuthEnv) {
  if (!googleAuthConfigured(env)) return redirect(request, PLATFORM_SIGN_IN_PATH);
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const expectedState = requestCookie(request, GOOGLE_OAUTH_STATE_COOKIE);
  const code = url.searchParams.get("code");
  if (url.searchParams.has("error")) return redirect(request, "/?auth_error=cancelled", cookieHeader(request, GOOGLE_OAUTH_STATE_COOKIE, "", 0));
  if (!state || !expectedState || state !== expectedState || !code) return redirect(request, "/?auth_error=invalid", cookieHeader(request, GOOGLE_OAUTH_STATE_COOKIE, "", 0));

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUrl(request),
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("token_exchange_failed");
    const tokens = await tokenResponse.json() as { access_token?: string };
    if (!tokens.access_token) throw new Error("token_exchange_failed");

    const userResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    if (!userResponse.ok) throw new Error("userinfo_failed");
    const user = await userResponse.json() as GoogleUserInfo;
    if (!user.sub || !user.email || user.email_verified !== true) throw new Error("unverified_google_account");

    const session = await createGoogleSessionToken({ sub: user.sub, email: user.email, name: user.name ?? user.email }, env.AUTH_SESSION_SECRET);
    const response = redirect(request, "/", cookieHeader(request, GOOGLE_SESSION_COOKIE, session, 60 * 60 * 24 * 30));
    response.headers.append("set-cookie", cookieHeader(request, GOOGLE_OAUTH_STATE_COOKIE, "", 0));
    return response;
  } catch {
    return redirect(request, "/?auth_error=failed", cookieHeader(request, GOOGLE_OAUTH_STATE_COOKIE, "", 0));
  }
}

function logout(request: Request, env: GoogleAuthEnv) {
  if (!googleAuthConfigured(env)) return redirect(request, PLATFORM_SIGN_OUT_PATH);
  return redirect(request, "/", cookieHeader(request, GOOGLE_SESSION_COOKIE, "", 0));
}

export function handleGoogleAuth(request: Request, env: GoogleAuthEnv) {
  const pathname = new URL(request.url).pathname;
  if (pathname === "/auth/google/start") return startGoogleLogin(request, env);
  if (pathname === "/auth/google/callback") return finishGoogleLogin(request, env);
  if (pathname === "/auth/logout") return Promise.resolve(logout(request, env));
  return null;
}
