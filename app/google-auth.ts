import { headers } from "next/headers";
import { GOOGLE_SESSION_HEADER } from "./server/auth/google-session";

export async function hasGoogleSession() {
  const requestHeaders = await headers();
  return requestHeaders.get(GOOGLE_SESSION_HEADER) === "verified"
    || Boolean(requestHeaders.get("oai-authenticated-user-id") && requestHeaders.get("oai-authenticated-user-email"));
}

export function googleSignInPath() {
  return "/auth/google/start";
}
