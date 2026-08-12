import { googleSessionFromRequest } from "./google-session";

export type RequestUser = {
  userHash: string;
  profileId: string;
  email: string;
  displayName: string;
  provider: "google";
};

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string) {
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function stableProfileId(digest: string) {
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-5${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
}

export async function requireRequestUser(request: Request, sessionSecret: string | undefined): Promise<RequestUser> {
  const session = await googleSessionFromRequest(request, sessionSecret);
  if (!session) throw new Error("signin_required");
  const userHash = await sha256(`google:${session.sub}`);
  return {
    userHash,
    profileId: stableProfileId(userHash),
    email: session.email,
    displayName: session.name,
    provider: "google",
  };
}

export async function hashSecret(value: string) {
  return sha256(value.trim());
}
