import type { CategoryKey, CharacterPresetKey, Profile, SharedArtwork, SharedFriend, WorkSession } from "../../lib/community-types";
import type { PresenceRow, ProfileRow, SessionRow, StudentRow } from "../../../db/schema";
import { requireRequestUser, hashSecret, type RequestUser } from "../auth/request-auth";
import { ensureDatabase } from "../db/runtime";

type CommunityEnv = { DB?: D1Database; UPLOADS?: R2Bucket };
type Member = StudentRow & { profile_id: string };

const categories = new Set<CategoryKey>(["sketch", "line", "color", "emoticon", "free"]);
const characterPresets = new Set<CharacterPresetKey>(["sky", "moss", "apricot", "rose", "violet", "lemon"]);
const profileIdPattern = /^[0-9a-f-]{36}$/i;
const ADMIN_KEY = "admin_user_hash";
const CLASS_CODE_KEY = "class_code_hash";
const TEACHER_NOTE_KEY = "teacher_note";

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "unexpected_error";
  const messages: Record<string, string> = {
    signin_required: "계속하려면 ChatGPT로 로그인해주세요.",
    membership_required: "수강생 명단에서 본인 이름을 먼저 연결해주세요.",
    database_binding_missing: "공동 작업실 저장소가 아직 준비되지 않았어요.",
    uploads_binding_missing: "이미지 저장소가 아직 준비되지 않았어요.",
    invalid_identity: "이전 기기의 프로필 정보를 확인하지 못했어요.",
    invalid_roster: "수강생 명단과 반 코드를 확인해주세요.",
    invalid_class_code: "반 코드가 맞지 않아요.",
    student_already_claimed: "이미 다른 계정에 연결된 이름이에요. 선생님에게 연결 해제를 요청해주세요.",
    profile_not_found: "프로필을 먼저 만들어주세요.",
    invalid_profile: "이름과 캐릭터 파일을 확인해주세요.",
    invalid_session: "작업 기록을 확인해주세요.",
    invalid_image: "이미지 파일을 확인해주세요.",
  };
  const status = code === "signin_required" ? 401 : code === "membership_required" ? 403 : code === "profile_not_found" ? 404 : 400;
  return Response.json({ error: messages[code] ?? "공동 작업실에 연결하지 못했어요." }, { status });
}

function validCategory(value: string): value is CategoryKey {
  return categories.has(value as CategoryKey);
}

function validCharacterPreset(value: string): value is CharacterPresetKey {
  return characterPresets.has(value as CharacterPresetKey);
}

function normalizeName(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
}

async function tokenHash(token: string) {
  return hashSecret(token);
}

function mediaUrl(request: Request, key: string | null | undefined) {
  return key ? `${new URL(request.url).origin}/api/media/${encodeURIComponent(key)}` : undefined;
}

function mapProfile(request: Request, row: ProfileRow): Profile {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    characterPreset: validCharacterPreset(row.character_preset) ? row.character_preset : "sky",
    characterDataUrl: mediaUrl(request, row.character_key),
    message: row.message,
  };
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

async function setting(database: D1Database, key: string) {
  return (await database.prepare("SELECT value FROM app_settings WHERE key = ?").bind(key).first<{ value: string }>())?.value ?? null;
}

async function memberFor(database: D1Database, auth: RequestUser): Promise<Member> {
  const member = await database.prepare("SELECT id, legal_name, nickname, auth_user_hash, profile_id FROM students WHERE auth_user_hash = ?")
    .bind(auth.userHash).first<StudentRow>();
  if (!member?.profile_id) throw new Error("membership_required");
  return member as Member;
}

async function rosterState(database: D1Database, auth: RequestUser, classCode = "") {
  const [adminHash, codeHash, member] = await Promise.all([
    setting(database, ADMIN_KEY),
    setting(database, CLASS_CODE_KEY),
    database.prepare("SELECT id, legal_name, nickname, auth_user_hash, profile_id FROM students WHERE auth_user_hash = ?")
      .bind(auth.userHash).first<StudentRow>(),
  ]);
  const isAdmin = adminHash === auth.userHash;
  const needsSetup = !adminHash;
  let codeMatches = false;
  if (classCode.trim() && codeHash) codeMatches = await hashSecret(classCode) === codeHash;
  let students: Array<{ id: string; legalName: string }> = [];
  if (!member && (isAdmin || codeMatches)) {
    const result = await database.prepare("SELECT id, legal_name FROM students WHERE auth_user_hash IS NULL ORDER BY normalized_name ASC LIMIT 200")
      .all<{ id: string; legal_name: string }>();
    students = result.results.map((student) => ({ id: student.id, legalName: student.legal_name }));
  }
  return { needsSetup, isAdmin, linked: Boolean(member), nickname: member?.nickname || undefined, students };
}

async function handleRoster(request: Request, database: D1Database, auth: RequestUser) {
  if (request.method === "GET") {
    const classCode = new URL(request.url).searchParams.get("classCode") ?? "";
    return Response.json(await rosterState(database, auth, classCode), { headers: { "cache-control": "no-store" } });
  }
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });

  const body = await request.json() as { action?: string; names?: string[]; classCode?: string; studentId?: string; nickname?: string };
  if (body.action === "setup") {
    const [adminHash, studentCount] = await Promise.all([
      setting(database, ADMIN_KEY),
      database.prepare("SELECT COUNT(*) AS count FROM students").first<{ count: number }>(),
    ]);
    if (adminHash || (studentCount?.count ?? 0) > 0) throw new Error("invalid_roster");
    const classCode = String(body.classCode ?? "").trim();
    const seen = new Set<string>();
    const names = (body.names ?? []).map((value) => String(value).trim().slice(0, 30)).filter((value) => {
      const normalized = normalizeName(value);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    if (classCode.length < 4 || classCode.length > 20 || names.length < 1 || names.length > 200) throw new Error("invalid_roster");
    const now = Date.now();
    const statements = [
      database.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").bind(ADMIN_KEY, auth.userHash, now),
      database.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").bind(CLASS_CODE_KEY, await hashSecret(classCode), now),
      ...names.map((name) => database.prepare("INSERT INTO students (id, legal_name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), name, normalizeName(name), now, now)),
    ];
    await database.batch(statements);
    return Response.json(await rosterState(database, auth, classCode), { status: 201 });
  }

  if (body.action === "claim") {
    const existing = await database.prepare("SELECT id FROM students WHERE auth_user_hash = ?").bind(auth.userHash).first();
    if (existing) return Response.json(await rosterState(database, auth));
    const [adminHash, codeHash] = await Promise.all([setting(database, ADMIN_KEY), setting(database, CLASS_CODE_KEY)]);
    const isAdmin = adminHash === auth.userHash;
    const classCode = String(body.classCode ?? "").trim();
    if (!isAdmin && (!codeHash || await hashSecret(classCode) !== codeHash)) throw new Error("invalid_class_code");
    const nickname = String(body.nickname ?? "").trim().slice(0, 12);
    const studentId = String(body.studentId ?? "");
    if (!nickname || !profileIdPattern.test(studentId)) throw new Error("invalid_roster");
    const result = await database.prepare(`UPDATE students SET nickname = ?, auth_user_hash = ?, profile_id = ?, updated_at = ?
      WHERE id = ? AND auth_user_hash IS NULL`).bind(nickname, auth.userHash, auth.profileId, Date.now(), studentId).run();
    if (!result.meta.changes) throw new Error("student_already_claimed");
    return Response.json(await rosterState(database, auth));
  }

  throw new Error("invalid_roster");
}

async function migrateLegacyProfile(database: D1Database, auth: RequestUser, member: Member, legacyId: string, ownerToken: string) {
  if (legacyId === member.profile_id || !profileIdPattern.test(legacyId) || ownerToken.length < 30) return null;
  const legacy = await database.prepare(`SELECT id, owner_token_hash, name, nickname, character_preset, character_key, message, created_at
    FROM profiles WHERE id = ?`).bind(legacyId).first<ProfileRow & { owner_token_hash: string; created_at: number }>();
  if (!legacy || legacy.owner_token_hash !== await tokenHash(ownerToken)) return null;
  const now = Date.now();
  await database.prepare(`INSERT INTO profiles (id, owner_token_hash, name, nickname, character_preset, character_key, message, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(member.profile_id, auth.userHash, legacy.name, member.nickname, legacy.character_preset, legacy.character_key, legacy.message, legacy.created_at, now).run();
  await database.prepare("DELETE FROM presence WHERE profile_id = ?").bind(legacyId).run();
  await database.prepare("UPDATE work_sessions SET profile_id = ? WHERE profile_id = ?").bind(member.profile_id, legacyId).run();
  await database.prepare("DELETE FROM profiles WHERE id = ?").bind(legacyId).run();
  return legacy;
}

async function handleProfile(request: Request, database: D1Database, uploads: R2Bucket, auth: RequestUser, member: Member) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim().slice(0, 12);
  const requestedPreset = String(form.get("characterPreset") ?? "sky");
  const characterPreset: CharacterPresetKey = validCharacterPreset(requestedPreset) ? requestedPreset : "sky";
  const removeCharacter = form.get("removeCharacter") === "1";
  const legacyId = String(form.get("profileId") ?? "");
  const ownerToken = String(form.get("ownerToken") ?? "");
  if (!name) throw new Error("invalid_profile");

  let existing = await database.prepare("SELECT id FROM profiles WHERE id = ?").bind(member.profile_id).first();
  if (!existing) {
    await migrateLegacyProfile(database, auth, member, legacyId, ownerToken);
    existing = await database.prepare("SELECT id FROM profiles WHERE id = ?").bind(member.profile_id).first();
  }

  let characterKey: string | null = null;
  const character = form.get("character");
  if (character instanceof File && character.size > 0) {
    if (character.type !== "image/png" || character.size > 6 * 1024 * 1024) throw new Error("invalid_image");
    characterKey = `characters/${member.profile_id}/${crypto.randomUUID()}.png`;
    await uploads.put(characterKey, character.stream(), { httpMetadata: { contentType: "image/png" } });
  }
  const now = Date.now();
  await database.prepare(`INSERT INTO profiles (id, owner_token_hash, name, nickname, character_preset, character_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET name = excluded.name, nickname = excluded.nickname,
      character_preset = excluded.character_preset,
      character_key = CASE WHEN ? = 1 THEN NULL ELSE COALESCE(excluded.character_key, profiles.character_key) END,
      updated_at = excluded.updated_at`)
    .bind(member.profile_id, auth.userHash, name, member.nickname, characterPreset, characterKey, now, now, removeCharacter ? 1 : 0).run();
  const row = await database.prepare("SELECT id, name, nickname, character_preset, character_key, message FROM profiles WHERE id = ?")
    .bind(member.profile_id).first<ProfileRow>();
  if (!row) throw new Error("invalid_profile");
  return Response.json({ profile: mapProfile(request, row), migrated: Boolean(existing) });
}

async function handleCommunity(request: Request, database: D1Database, member: Member) {
  if (request.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const [profile, activeResult, galleryResult, sessionsResult, teacherNote] = await Promise.all([
    database.prepare("SELECT id, name, nickname, character_preset, character_key, message FROM profiles WHERE id = ?").bind(member.profile_id).first<ProfileRow>(),
    database.prepare(`SELECT p.id, p.name, p.nickname, p.character_preset, p.character_key, p.message, pr.mode, pr.category, pr.started_at
      FROM presence pr JOIN profiles p ON p.id = pr.profile_id
      WHERE pr.updated_at >= ? ORDER BY pr.mode DESC, pr.started_at ASC LIMIT 100`).bind(Date.now() - 90_000).all<PresenceRow>(),
    database.prepare(`SELECT s.id, s.profile_id, s.seconds, s.category, s.artwork_key, s.note, s.completed_at,
      COALESCE(NULLIF(p.nickname, ''), p.name) AS artist, p.character_key
      FROM work_sessions s JOIN profiles p ON p.id = s.profile_id ORDER BY s.completed_at DESC LIMIT 40`).all<SessionRow>(),
    database.prepare(`SELECT id, profile_id, seconds, category, artwork_key, note, completed_at
      FROM work_sessions WHERE profile_id = ? ORDER BY completed_at DESC LIMIT 180`).bind(member.profile_id).all<SessionRow>(),
    setting(database, TEACHER_NOTE_KEY),
  ]);
  const active: SharedFriend[] = activeResult.results.map((row) => ({
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    characterPreset: validCharacterPreset(row.character_preset) ? row.character_preset : "sky",
    characterDataUrl: mediaUrl(request, row.character_key),
    mode: row.mode === "working" ? "working" : "idle",
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
    teacherNote: teacherNote ?? "완성보다 시작이 중요해요. 이번 주도 가볍게 한 장 꺼내봐요.",
  }, { headers: { "cache-control": "no-store" } });
}

async function handleTeacherNote(request: Request, database: D1Database, auth: RequestUser) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  if (await setting(database, ADMIN_KEY) !== auth.userHash) return Response.json({ error: "host_only" }, { status: 403 });
  const body = await request.json() as { note?: string };
  const note = String(body.note ?? "").trim().slice(0, 180);
  if (!note) throw new Error("invalid_profile");
  const now = Date.now();
  await database.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
    .bind(TEACHER_NOTE_KEY, note, now).run();
  return Response.json({ teacherNote: note });
}

async function handleMessage(request: Request, database: D1Database, member: Member) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const body = await request.json() as { message?: string };
  const message = String(body.message ?? "").trim().slice(0, 60);
  await database.prepare("UPDATE profiles SET message = ?, updated_at = ? WHERE id = ?").bind(message, Date.now(), member.profile_id).run();
  const row = await database.prepare("SELECT id, name, nickname, character_preset, character_key, message FROM profiles WHERE id = ?").bind(member.profile_id).first<ProfileRow>();
  if (!row) throw new Error("profile_not_found");
  return Response.json({ profile: mapProfile(request, row) });
}

async function handlePresence(request: Request, database: D1Database, member: Member) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const body = await request.json() as { online?: boolean; running?: boolean; category?: string; startedAt?: number };
  if (body.online === false) {
    await database.prepare("DELETE FROM presence WHERE profile_id = ?").bind(member.profile_id).run();
    return Response.json({ ok: true });
  }
  const category = body.category && validCategory(body.category) ? body.category : "free";
  const mode = body.running ? "working" : "idle";
  const now = Date.now();
  const requestedStart = Number(body.startedAt ?? now);
  const startedAt = mode === "working" ? Math.max(now - 12 * 60 * 60 * 1000, Math.min(now, requestedStart)) : now;
  await database.prepare(`INSERT INTO presence (profile_id, mode, category, started_at, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(profile_id) DO UPDATE SET mode = excluded.mode, category = excluded.category,
      started_at = excluded.started_at, updated_at = excluded.updated_at`)
    .bind(member.profile_id, mode, category, startedAt, now).run();
  return Response.json({ ok: true });
}

async function handleSession(request: Request, database: D1Database, uploads: R2Bucket, member: Member) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const form = await request.formData();
  const sessionId = String(form.get("sessionId") ?? "");
  const seconds = Math.max(1, Math.min(43_200, Number(form.get("seconds") ?? 0)));
  const category = String(form.get("category") ?? "");
  const note = String(form.get("note") ?? "").trim().slice(0, 100);
  const completedAt = new Date(String(form.get("completedAt") ?? "")).getTime();
  const artwork = form.get("artwork");
  if (!profileIdPattern.test(sessionId) || !validCategory(category) || !Number.isFinite(completedAt) || !(artwork instanceof File)) throw new Error("invalid_session");
  if (!artwork.type.startsWith("image/") || artwork.size > 8 * 1024 * 1024) throw new Error("invalid_image");
  const extension = artwork.type === "image/png" ? "png" : artwork.type === "image/webp" ? "webp" : "jpg";
  const artworkKey = `artworks/${member.profile_id}/${sessionId}.${extension}`;
  await uploads.put(artworkKey, artwork.stream(), { httpMetadata: { contentType: artwork.type } });
  const now = Date.now();
  await database.prepare(`INSERT INTO work_sessions (id, profile_id, seconds, category, artwork_key, note, completed_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
    .bind(sessionId, member.profile_id, seconds, category, artworkKey, note, completedAt, now).run();
  const row = await database.prepare("SELECT id, profile_id, seconds, category, artwork_key, note, completed_at FROM work_sessions WHERE id = ?")
    .bind(sessionId).first<SessionRow>();
  if (!row) throw new Error("invalid_session");
  return Response.json({ session: mapSession(request, row) }, { status: 201 });
}

async function handleMedia(request: Request, uploads: R2Bucket) {
  if (request.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const key = decodeURIComponent(new URL(request.url).pathname.replace("/api/media/", ""));
  if (!key.startsWith("characters/") && !key.startsWith("artworks/")) return new Response("Not found", { status: 404 });
  const object = await uploads.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  return new Response(object.body, { headers: { "content-type": object.httpMetadata?.contentType ?? "application/octet-stream", "cache-control": "private, max-age=3600", etag: object.httpEtag } });
}

export async function handleCommunityApi(request: Request, env: CommunityEnv) {
  try {
    if (!env.DB) throw new Error("database_binding_missing");
    if (!env.UPLOADS) throw new Error("uploads_binding_missing");
    await ensureDatabase(env.DB);
    const auth = await requireRequestUser(request);
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/roster") return handleRoster(request, env.DB, auth);
    const member = await memberFor(env.DB, auth);
    if (pathname === "/api/profile") return handleProfile(request, env.DB, env.UPLOADS, auth, member);
    if (pathname === "/api/community") return handleCommunity(request, env.DB, member);
    if (pathname === "/api/presence") return handlePresence(request, env.DB, member);
    if (pathname === "/api/message") return handleMessage(request, env.DB, member);
    if (pathname === "/api/teacher-note") return handleTeacherNote(request, env.DB, auth);
    if (pathname === "/api/sessions") return handleSession(request, env.DB, env.UPLOADS, member);
    if (pathname.startsWith("/api/media/")) return handleMedia(request, env.UPLOADS);
    return new Response("Not found", { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
