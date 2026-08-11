export type RequestUser = {
  userHash: string;
  profileId: string;
  email: string;
  displayName: string;
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

function fullName(request: Request) {
  const encoded = request.headers.get("oai-authenticated-user-full-name");
  if (!encoded || request.headers.get("oai-authenticated-user-full-name-encoding") !== "percent-encoded-utf-8") return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export async function requireRequestUser(request: Request): Promise<RequestUser> {
  const userId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email");
  if (!userId || !email) throw new Error("signin_required");
  const userHash = await sha256(userId);
  return { userHash, profileId: stableProfileId(userHash), email, displayName: fullName(request) ?? email };
}

export async function hashSecret(value: string) {
  return sha256(value.trim());
}
