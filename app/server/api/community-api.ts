import type { CategoryKey, Profile, SharedArtwork, SharedFriend, WorkSession } from "../../lib/community-types";
import type { PresenceRow, ProfileRow, SessionRow } from "../../../db/schema";
import { ensureDatabase } from "../db/runtime";

type CommunityEnv = {
  DB?: D1Database;
  UPLOADS?: R2Bucket;
};

const categories = new Set<CategoryKey>(["sketch", "line", "color", "emoticon", "free"]);
const profileIdPattern = /^[0-9a-f-]{36}$/i;

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "unexpected_error";
  const messages: Record<string, string> = {
    database_binding_missing: "공동 작업실 저장소가 아직 준비되지 않았어요.",
    uploads_binding_missing: "이미지 저장소가 아직 준비되지 않았어요.",
    invalid_identity: "이 기기의 프로필 정보를 확인하지 못했어요.",
    profile_not_found: "프로필을 먼저 만들어주세요.",
    invalid_profile: "이름과 캐릭터 파일을 확인해주세요.",
    invalid_session: "작업 기록을 확인해주세요.",
    invalid_image: "이미지 파일을 확인해주세요.",
  };
  return Response.json({ error: messages[code] ?? "공동 작업실에 연결하지 못했어요." }, { status: code === "profile_not_found" ? 404 : 400 });
}

function validIdentity(profileId: string, ownerToken?: string) {
  if (!profileIdPattern.test(profileId) || (ownerToken !== undefined && ownerToken.length < 30)) throw new Error("invalid_identity");
}

function validCategory(value: string): value is CategoryKey {
  return categories.has(value as CategoryKey);
}

async function tokenHash(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function mediaUrl(request: Request, key: string | null | undefined) {
  return key ? `${new URL(request.url).origin}/api/media/${encodeURIComponent(key)}` : undefined;
}

function mapProfile(request: Request, row: ProfileRow): Profile {
  return { id: row.id, name: row.name, characterDataUrl: mediaUrl(request, row.character_key), message: row.message };
}

function mapSession(request: Request, row: SessionRow): WorkSession {
  return {
    id: row.id,
    completedAt: new Date(row.completed_at).toISOString(),
    seconds: row.seconds,
    category: row.category as CategoryKey,
    artworkDataUrl: mediaUrl(request, row.artwork_key) ?? "",
    note: row.note,
  };
}

async function requireOwner(database: D1Database, profileId: string, ownerToken: string) {
  validIdentity(profileId, ownerToken);
  const row = await database.prepare("SELECT owner_token_hash FROM profiles WHERE id = ?").bind(profileId).first<{ owner_token_hash: string }>();
  if (!row || row.owner_token_hash !== await tokenHash(ownerToken)) throw new Error("invalid_identity");
}

async function handleProfile(request: Request, database: D1Database, uploads: R2Bucket) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const form = await request.formData();
  const profileId = String(form.get("profileId") ?? "");
  const ownerToken = String(form.get("ownerToken") ?? "");
  const name = String(form.get("name") ?? "").trim().slice(0, 12);
  validIdentity(profileId, ownerToken);
  if (!name) throw new Error("invalid_profile");

  const existing = await database.prepare("SELECT id, owner_token_hash FROM profiles WHERE id = ?").bind(profileId).first<{ id: string; owner_token_hash: string }>();
  const hash = await tokenHash(ownerToken);
  if (existing && existing.owner_token_hash !== hash) throw new Error("invalid_identity");

  let characterKey: string | null = null;
  const character = form.get("character");
  if (character instanceof File && character.size > 0) {
    if (character.type !== "image/png" || character.size > 6 * 1024 * 1024) throw new Error("invalid_image");
    characterKey = `characters/${profileId}/${crypto.randomUUID()}.png`;
    await uploads.put(characterKey, character.stream(), { httpMetadata: { contentType: "image/png" } });
  }
  const now = Date.now();
  await database.prepare(`INSERT INTO profiles (id, owner_token_hash, name, character_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, character_key = COALESCE(excluded.character_key, profiles.character_key), updated_at = excluded.updated_at`)
    .bind(profileId, hash, name, characterKey, now, now).run();
  const row = await database.prepare("SELECT id, name, character_key, message FROM profiles WHERE id = ?").bind(profileId).first<ProfileRow>();
  if (!row) throw new Error("invalid_profile");
  return Response.json({ profile: mapProfile(request, row) });
}

async function handleCommunity(request: Request, database: D1Database) {
  if (request.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const profileId = new URL(request.url).searchParams.get("profileId") ?? "";
  validIdentity(profileId);
  const [profile, activeResult, galleryResult, sessionsResult] = await Promise.all([
    database.prepare("SELECT id, name, character_key, message FROM profiles WHERE id = ?").bind(profileId).first<ProfileRow>(),
    database.prepare(`SELECT p.id, p.name, p.character_key, p.message, pr.category, pr.started_at
      FROM presence pr JOIN profiles p ON p.id = pr.profile_id
      WHERE pr.updated_at >= ? ORDER BY pr.started_at ASC LIMIT 60`).bind(Date.now() - 90_000).all<PresenceRow>(),
    database.prepare(`SELECT s.id, s.profile_id, s.seconds, s.category, s.artwork_key, s.note, s.completed_at, p.name AS artist, p.character_key
      FROM work_sessions s JOIN profiles p ON p.id = s.profile_id
      ORDER BY s.completed_at DESC LIMIT 40`).all<SessionRow>(),
    database.prepare(`SELECT id, profile_id, seconds, category, artwork_key, note, completed_at
      FROM work_sessions WHERE profile_id = ? ORDER BY completed_at DESC LIMIT 180`).bind(profileId).all<SessionRow>(),
  ]);
  const active: SharedFriend[] = activeResult.results.map((row) => ({
    id: row.id,
    name: row.name,
    characterDataUrl: mediaUrl(request, row.character_key),
    category: row.category as CategoryKey,
    startedAt: row.started_at,
    message: row.message,
  }));
  const gallery: SharedArtwork[] = galleryResult.results.map((row) => ({
    ...mapSession(request, row),
    artist: row.artist ?? "작업친구",
    artistCharacterDataUrl: mediaUrl(request, row.character_key),
  }));
  return Response.json({
    profile: profile ? mapProfile(request, profile) : null,
    active,
    gallery,
    sessions: sessionsResult.results.map((row) => mapSession(request, row)),
  }, { headers: { "cache-control": "no-store" } });
}

async function handleMessage(request: Request, database: D1Database) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const body = await request.json() as { profileId?: string; ownerToken?: string; message?: string };
  const profileId = body.profileId ?? "";
  const ownerToken = body.ownerToken ?? "";
  await requireOwner(database, profileId, ownerToken);
  const message = String(body.message ?? "").trim().slice(0, 60);
  await database.prepare("UPDATE profiles SET message = ?, updated_at = ? WHERE id = ?").bind(message, Date.now(), profileId).run();
  const row = await database.prepare("SELECT id, name, character_key, message FROM profiles WHERE id = ?").bind(profileId).first<ProfileRow>();
  if (!row) throw new Error("profile_not_found");
  return Response.json({ profile: mapProfile(request, row) });
}

async function handlePresence(request: Request, database: D1Database) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const body = await request.json() as { profileId?: string; ownerToken?: string; running?: boolean; category?: string; startedAt?: number };
  const profileId = body.profileId ?? "";
  const ownerToken = body.ownerToken ?? "";
  await requireOwner(database, profileId, ownerToken);
  if (!body.running) {
    await database.prepare("DELETE FROM presence WHERE profile_id = ?").bind(profileId).run();
    return Response.json({ ok: true });
  }
  if (!body.category || !validCategory(body.category)) throw new Error("invalid_session");
  const now = Date.now();
  const requestedStart = Number(body.startedAt ?? now);
  const startedAt = Math.max(now - 12 * 60 * 60 * 1000, Math.min(now, requestedStart));
  await database.prepare(`INSERT INTO presence (profile_id, category, started_at, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET category = excluded.category, started_at = excluded.started_at, updated_at = excluded.updated_at`)
    .bind(profileId, body.category, startedAt, now).run();
  return Response.json({ ok: true });
}

async function handleSession(request: Request, database: D1Database, uploads: R2Bucket) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const form = await request.formData();
  const profileId = String(form.get("profileId") ?? "");
  const ownerToken = String(form.get("ownerToken") ?? "");
  await requireOwner(database, profileId, ownerToken);
  const sessionId = String(form.get("sessionId") ?? "");
  const seconds = Math.max(1, Math.min(43_200, Number(form.get("seconds") ?? 0)));
  const category = String(form.get("category") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 100);
  const completedAt = new Date(String(form.get("completedAt") ?? "")).getTime();
  const artwork = form.get("artwork");
  if (!profileIdPattern.test(sessionId) || !validCategory(category) || !Number.isFinite(completedAt) || !(artwork instanceof File)) throw new Error("invalid_session");
  if (!artwork.type.startsWith("image/") || artwork.size > 8 * 1024 * 1024) throw new Error("invalid_image");
  const extension = artwork.type === "image/png" ? "png" : artwork.type === "image/webp" ? "webp" : "jpg";
  const artworkKey = `artworks/${profileId}/${sessionId}.${extension}`;
  await uploads.put(artworkKey, artwork.stream(), { httpMetadata: { contentType: artwork.type } });
  const now = Date.now();
  await database.prepare(`INSERT INTO work_sessions (id, profile_id, seconds, category, artwork_key, note, completed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO NOTHING`).bind(sessionId, profileId, seconds, category, artworkKey, note, completedAt, now).run();
  await database.prepare("DELETE FROM presence WHERE profile_id = ?").bind(profileId).run();
  const row = await database.prepare("SELECT id, profile_id, seconds, category, artwork_key, note, completed_at FROM work_sessions WHERE id = ?").bind(sessionId).first<SessionRow>();
  if (!row) throw new Error("invalid_session");
  return Response.json({ session: mapSession(request, row) }, { status: 201 });
}

async function handleMedia(request: Request, uploads: R2Bucket) {
  if (request.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const encoded = new URL(request.url).pathname.replace("/api/media/", "");
  const key = decodeURIComponent(encoded);
  if (!key.startsWith("characters/") && !key.startsWith("artworks/")) return new Response("Not found", { status: 404 });
  const object = await uploads.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, {
    headers: {
      "content-type": object.httpMetadata?.contentType ?? "application/octet-stream",
      "cache-control": "public, max-age=31536000, immutable",
      etag: object.httpEtag,
    },
  });
}

export async function handleCommunityApi(request: Request, env: CommunityEnv) {
  try {
    if (!env.DB) throw new Error("database_binding_missing");
    if (!env.UPLOADS) throw new Error("uploads_binding_missing");
    await ensureDatabase(env.DB);
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/profile") return handleProfile(request, env.DB, env.UPLOADS);
    if (pathname === "/api/community") return handleCommunity(request, env.DB);
    if (pathname === "/api/presence") return handlePresence(request, env.DB);
    if (pathname === "/api/message") return handleMessage(request, env.DB);
    if (pathname === "/api/sessions") return handleSession(request, env.DB, env.UPLOADS);
    if (pathname.startsWith("/api/media/")) return handleMedia(request, env.UPLOADS);
    return new Response("Not found", { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
