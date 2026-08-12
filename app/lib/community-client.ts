import type {
  CategoryKey,
  CommunitySnapshot,
  DeviceIdentity,
  Profile,
  RosterSnapshot,
  WorkSession,
} from "./community-types";

const IDENTITY_KEY = "otw-community-identity-v1";

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "공동 작업실에 연결하지 못했어요.");
  return payload;
}

function dataUrlFile(dataUrl: string, filename: string) {
  return fetch(dataUrl).then(async (response) => new File([await response.blob()], filename, { type: response.headers.get("content-type") ?? "application/octet-stream" }));
}

export function getDeviceIdentity(): DeviceIdentity {
  const saved = window.localStorage.getItem(IDENTITY_KEY);
  if (saved) {
    try {
      const identity = JSON.parse(saved) as DeviceIdentity;
      if (identity.profileId && identity.ownerToken) return identity;
    } catch { /* 새 기기 정보로 복구 */ }
  }
  const identity = { profileId: crypto.randomUUID(), ownerToken: `${crypto.randomUUID()}-${crypto.randomUUID()}` };
  window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
  return identity;
}

export async function fetchCommunity(identity: DeviceIdentity): Promise<CommunitySnapshot> {
  const query = new URLSearchParams({ profileId: identity.profileId });
  return responseJson<CommunitySnapshot>(await fetch(`/api/community?${query}`, { cache: "no-store" }));
}

export async function fetchRoster(classCode = ""): Promise<RosterSnapshot> {
  const query = classCode ? `?${new URLSearchParams({ classCode })}` : "";
  return responseJson<RosterSnapshot>(await fetch(`/api/roster${query}`, { cache: "no-store" }));
}

export async function setupRoster(names: string[], classCode: string): Promise<RosterSnapshot> {
  return responseJson<RosterSnapshot>(await fetch("/api/roster", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "setup", names, classCode }),
  }));
}

export async function claimRoster(studentId: string, nickname: string, classCode: string): Promise<RosterSnapshot> {
  return responseJson<RosterSnapshot>(await fetch("/api/roster", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "claim", studentId, nickname, classCode }),
  }));
}

export async function addRosterStudents(names: string[]): Promise<RosterSnapshot> {
  return responseJson<RosterSnapshot>(await fetch("/api/roster", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "add", names }),
  }));
}

export async function removeRosterStudent(studentId: string): Promise<RosterSnapshot> {
  return responseJson<RosterSnapshot>(await fetch("/api/roster", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "remove", studentId }),
  }));
}

export async function saveCloudProfile(identity: DeviceIdentity, profile: Profile): Promise<Profile> {
  const form = new FormData();
  form.set("profileId", identity.profileId);
  form.set("ownerToken", identity.ownerToken);
  form.set("name", profile.name);
  form.set("characterPreset", profile.characterPreset ?? "sky");
  if (!profile.characterDataUrl) form.set("removeCharacter", "1");
  if (profile.characterDataUrl?.startsWith("data:")) {
    form.set("character", await dataUrlFile(profile.characterDataUrl, "my-character.png"));
  }
  const payload = await responseJson<{ profile: Profile }>(await fetch("/api/profile", { method: "POST", body: form }));
  return payload.profile;
}

export async function updatePresence(identity: DeviceIdentity, running: boolean, category: CategoryKey, startedAt?: number) {
  await responseJson<{ ok: true }>(await fetch("/api/presence", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...identity, online: true, running, category, startedAt }),
    keepalive: true,
  }));
}

export async function updateSharedMessage(identity: DeviceIdentity, message: string): Promise<Profile> {
  const payload = await responseJson<{ profile: Profile }>(await fetch("/api/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...identity, message }),
  }));
  return payload.profile;
}

export async function updateTeacherNote(note: string): Promise<string> {
  const payload = await responseJson<{ teacherNote: string }>(await fetch("/api/teacher-note", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ note }),
  }));
  return payload.teacherNote;
}

export function sendPresenceStop(identity: DeviceIdentity, category: CategoryKey) {
  const body = JSON.stringify({ ...identity, online: true, running: false, category });
  if (navigator.sendBeacon) navigator.sendBeacon("/api/presence", new Blob([body], { type: "application/json" }));
  else fetch("/api/presence", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

export function sendPresenceOffline(identity: DeviceIdentity) {
  const body = JSON.stringify({ ...identity, online: false });
  if (navigator.sendBeacon) navigator.sendBeacon("/api/presence", new Blob([body], { type: "application/json" }));
  else fetch("/api/presence", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => undefined);
}

export async function saveCloudSession(identity: DeviceIdentity, session: WorkSession): Promise<WorkSession> {
  const form = new FormData();
  form.set("profileId", identity.profileId);
  form.set("ownerToken", identity.ownerToken);
  form.set("sessionId", session.id);
  form.set("seconds", String(session.seconds));
  form.set("category", session.category);
  form.set("note", session.note);
  form.set("completedAt", session.completedAt);
  form.set("artwork", await dataUrlFile(session.artworkDataUrl, "today-artwork.jpg"));
  const payload = await responseJson<{ session: WorkSession }>(await fetch("/api/sessions", { method: "POST", body: form }));
  return payload.session;
}

export async function removeGalleryArtwork(sessionId: string): Promise<void> {
  await responseJson<{ ok: true }>(await fetch("/api/gallery", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  }));
}
