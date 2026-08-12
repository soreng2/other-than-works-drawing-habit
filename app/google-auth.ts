import { headers } from "next/headers";
import { GOOGLE_SESSION_HEADER } from "./server/auth/google-session";

export async function hasGoogleSession() {
  return (await headers()).get(GOOGLE_SESSION_HEADER) === "verified";
}

export function googleSignInPath() {
  return "/auth/google/start";
}
