import type { CategoryKey, CharacterPresetKey, Profile, SharedArtwork, SharedFriend, WorkSession } from "../../lib/community-types";
import type { ClassRow, PresenceRow, ProfileRow, SessionRow, StudentRow } from "../../../db/schema";
import { requireRequestUser, hashSecret, type RequestUser } from "../auth/request-auth";
import { ensureDatabase } from "../db/runtime";

type CommunityEnv = { DB?: D1Database; UPLOADS?: R2Bucket; AUTH_SESSION_SECRET?: string };
type Member = StudentRow & { profile_id: string; class_name?: string | null };

const categories = new Set<CategoryKey>(["sketch", "line", "color", "emoticon", "free"]);
const characterPresets = new Set<CharacterPresetKey>(["sky", "moss", "apricot", "rose", "violet", "lemon"]);
const profileIdPattern = /^[0-9a-f-]{36}$/i;
const ADMIN_KEY = "admin_user_hash";
const CLASS_CODE_KEY = "class_code_hash";
const CLASS_CODE_DISPLAY_KEY = "class_code_display";
const TEACHER_NOTE_KEY = "teacher_note";
const HOST_MEMBER_LABEL = "선생님";
const DESIGNATED_ADMIN_EMAILS = new Set(["mon.mut.friends@gmail.com", "mon.mut.friend@gmail.com"]);

function errorResponse(error: unknown) {
  const code = error instanceof Error ? error.message : "unexpected_error";
  const messages: Record<string, string> = {
    signin_required: "계속하려면 Google 계정으로 다시 로그인해주세요.",
    membership_required: "닉네임과 반을 먼저 설정해주세요.",
    database_binding_missing: "공동 작업실 저장소가 아직 준비되지 않았어요.",
    uploads_binding_missing: "이미지 저장소가 아직 준비되지 않았어요.",
    invalid_identity: "이전 기기의 프로필 정보를 확인하지 못했어요.",
    invalid_roster: "닉네임과 반 정보를 확인해주세요.",
    invalid_class_code: "반 코드가 맞지 않아요.",
    invalid_class: "선택한 반을 찾지 못했어요.",
    host_only: "수강생 명단은 선생님 계정에서만 바꿀 수 있어요.",
    no_new_students: "새로 추가할 수강생 이름이 없어요.",
    student_already_claimed: "이미 다른 계정에 연결된 이름이에요. 선생님에게 연결 해제를 요청해주세요.",
    profile_not_found: "프로필을 먼저 만들어주세요.",
    invalid_profile: "이름과 캐릭터 파일을 확인해주세요.",
    invalid_session: "작업 기록을 확인해주세요.",
    invalid_image: "이미지 파일을 확인해주세요.",
    artwork_not_found: "전시된 그림을 찾지 못했어요.",
    gallery_delete_forbidden: "본인의 그림만 전시에서 내릴 수 있어요.",
  };
  const status = code === "signin_required" ? 401 : code === "membership_required" || code === "host_only" || code === "gallery_delete_forbidden" ? 403 : code === "profile_not_found" || code === "artwork_not_found" ? 404 : 400;
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

function isDesignatedAdmin(auth: RequestUser) {
  return DESIGNATED_ADMIN_EMAILS.has(auth.email.trim().toLowerCase());
}

async function tokenHash(token: string) {
  return hashSecret(token);
}

function mediaUrl(request: Request, key: string | null | undefined) {
  return key ? `${new URL(request.url).origin}/api/media/${encodeURIComponent(key)}` : undefined;
}

function mapProfile(request: Request, row: ProfileRow, className?: string | null): Profile {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname,
    characterPreset: validCharacterPreset(row.character_preset) ? row.character_preset : "sky",
    characterDataUrl: mediaUrl(request, row.character_key),
    message: row.message,
    className: className || undefined,
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
  const member = await database.prepare(`SELECT s.id, s.legal_name, s.nickname, s.auth_user_hash, s.auth_provider, s.auth_email, s.profile_id, s.class_id, c.name AS class_name
    FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.auth_user_hash = ?`)
    .bind(auth.userHash).first<Member>();
  if (!member?.profile_id) throw new Error("membership_required");
  await database.prepare("UPDATE students SET last_seen_at = ?, updated_at = ? WHERE id = ?")
    .bind(Date.now(), Date.now(), member.id).run();
  return member as Member;
}

function hostNickname(auth: RequestUser) {
  const displayName = auth.displayName.trim();
  return displayName && !displayName.includes("@") ? displayName.slice(0, 12) : HOST_MEMBER_LABEL;
}

async function ensureAdminMember(database: D1Database, auth: RequestUser): Promise<Member> {
  const existing = await database.prepare(`SELECT s.id, s.legal_name, s.nickname, s.auth_user_hash, s.auth_provider, s.auth_email, s.profile_id, s.class_id, c.name AS class_name
    FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.auth_user_hash = ?`)
    .bind(auth.userHash).first<Member>();
  if (existing?.profile_id) return existing as Member;
  const now = Date.now();
  const previousHost = await database.prepare("SELECT id, profile_id FROM students WHERE normalized_name = '__host__' LIMIT 1")
    .first<Pick<StudentRow, "id" | "profile_id">>();
  if (previousHost) {
    const profileId = previousHost.profile_id || auth.profileId;
    const statements = [
      database.prepare(`UPDATE students SET nickname = ?, auth_user_hash = ?, auth_provider = ?, auth_email = ?, profile_id = ?, updated_at = ? WHERE id = ?`)
        .bind(hostNickname(auth), auth.userHash, auth.provider, auth.email, profileId, now, previousHost.id),
      database.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .bind(ADMIN_KEY, auth.userHash, now),
    ];
    if (previousHost.profile_id) statements.push(database.prepare("UPDATE profiles SET owner_token_hash = ?, updated_at = ? WHERE id = ?")
      .bind(auth.userHash, now, previousHost.profile_id));
    await database.batch(statements);
  } else {
  await database.prepare(`INSERT OR IGNORE INTO students
    (id, legal_name, normalized_name, nickname, auth_user_hash, auth_provider, auth_email, profile_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(), HOST_MEMBER_LABEL, "__host__", hostNickname(auth), auth.userHash, auth.provider, auth.email, auth.profileId, now, now,
  ).run();
  }
  const member = await database.prepare(`SELECT s.id, s.legal_name, s.nickname, s.auth_user_hash, s.auth_provider, s.auth_email, s.profile_id, s.class_id, c.name AS class_name
    FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.auth_user_hash = ?`)
    .bind(auth.userHash).first<Member>();
  if (!member?.profile_id) throw new Error("invalid_roster");
  return member as Member;
}

async function rosterState(database: D1Database, auth: RequestUser, classCode = "") {
  const [adminHash, codeHash, savedClassCode, member, classResult] = await Promise.all([
    setting(database, ADMIN_KEY),
    setting(database, CLASS_CODE_KEY),
    setting(database, CLASS_CODE_DISPLAY_KEY),
    database.prepare(`SELECT s.id, s.legal_name, s.nickname, s.auth_user_hash, s.auth_provider, s.auth_email, s.profile_id, s.class_id, c.name AS class_name
      FROM students s LEFT JOIN classes c ON c.id = s.class_id WHERE s.auth_user_hash = ?`)
      .bind(auth.userHash).first<Member>(),
    database.prepare("SELECT id, name, code_display FROM classes WHERE is_active = 1 ORDER BY created_at ASC LIMIT 50")
      .all<Pick<ClassRow, "id" | "name" | "code_display">>(),
  ]);
  const isAdmin = isDesignatedAdmin(auth);
  const needsSetup = !adminHash && isAdmin;
  const resolvedMember = isAdmin && !member ? await ensureAdminMember(database, auth) : member;
  let codeMatches = false;
  if (classCode.trim() && codeHash) codeMatches = await hashSecret(classCode) === codeHash;
  const classes = classResult.results.map((item) => ({ id: item.id, name: item.name, code: isAdmin ? item.code_display : undefined }));
  let students: Array<{ id: string; legalName: string; nickname?: string; claimed: boolean; classId?: string; className?: string; lastSeenAt?: string; drawingCount?: number; drawingSeconds?: number }> = [];
  if (isAdmin) {
    const result = await database.prepare(`SELECT s.id, s.legal_name, s.nickname, s.auth_user_hash, s.class_id, s.last_seen_at, c.name AS class_name,
        COUNT(ws.id) AS drawing_count, COALESCE(SUM(ws.seconds), 0) AS drawing_seconds
      FROM students s LEFT JOIN classes c ON c.id = s.class_id
      LEFT JOIN work_sessions ws ON ws.profile_id = s.profile_id
      WHERE s.normalized_name != '__host__'
      GROUP BY s.id, s.legal_name, s.nickname, s.auth_user_hash, s.class_id, s.last_seen_at, c.name, c.created_at, s.updated_at
      ORDER BY c.created_at ASC, s.updated_at DESC LIMIT 500`)
      .all<Pick<StudentRow, "id" | "legal_name" | "nickname" | "auth_user_hash" | "class_id" | "last_seen_at"> & { class_name?: string; drawing_count: number; drawing_seconds: number }>();
    students = result.results.map((student) => ({
      id: student.id,
      legalName: student.legal_name,
      nickname: student.nickname || undefined,
      claimed: Boolean(student.auth_user_hash),
      classId: student.class_id || undefined,
      className: student.class_name || undefined,
      lastSeenAt: student.last_seen_at ? new Date(student.last_seen_at).toISOString() : undefined,
      drawingCount: Number(student.drawing_count || 0),
      drawingSeconds: Number(student.drawing_seconds || 0),
    }));
  } else if (!resolvedMember && codeMatches) {
    const result = await database.prepare(`SELECT id, legal_name, nickname, auth_user_hash FROM students
      WHERE normalized_name != '__host__' ORDER BY normalized_name ASC LIMIT 200`)
      .all<Pick<StudentRow, "id" | "legal_name" | "nickname" | "auth_user_hash">>();
    students = result.results.map((student) => ({
      id: student.id,
      legalName: student.legal_name,
      nickname: student.nickname || undefined,
      claimed: Boolean(student.auth_user_hash),
    }));
  }
  return {
    needsSetup,
    isAdmin,
    linked: Boolean(resolvedMember),
    nickname: resolvedMember?.nickname || undefined,
    classCode: isAdmin ? savedClassCode || undefined : undefined,
    className: resolvedMember?.class_name || undefined,
    classes,
    students,
  };
}

async function handleRoster(request: Request, database: D1Database, auth: RequestUser) {
  if (request.method === "GET") {
    const classCode = new URL(request.url).searchParams.get("classCode") ?? "";
    return Response.json(await rosterState(database, auth, classCode), { headers: { "cache-control": "no-store" } });
  }
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });

  const body = await request.json() as { action?: string; names?: string[]; classCode?: string; classId?: string; className?: string; studentId?: string; nickname?: string };
  if (body.action === "setup") {
    if (!isDesignatedAdmin(auth)) throw new Error("host_only");
    const [adminHash, studentCount] = await Promise.all([
      setting(database, ADMIN_KEY),
      database.prepare("SELECT COUNT(*) AS count FROM students WHERE normalized_name != '__host__'").first<{ count: number }>(),
    ]);
    if (adminHash || (studentCount?.count ?? 0) > 0) throw new Error("invalid_roster");
    const classCode = String(body.classCode ?? "").trim();
    const className = String(body.className ?? "첫 번째 반").trim().slice(0, 20);
    const seen = new Set<string>();
    const names = (body.names ?? []).map((value) => String(value).trim().slice(0, 30)).filter((value) => {
      const normalized = normalizeName(value);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    if (!className || classCode.length < 4 || classCode.length > 20 || names.length > 200) throw new Error("invalid_roster");
    const now = Date.now();
    const classId = crypto.randomUUID();
    const statements = [
      database.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").bind(ADMIN_KEY, auth.userHash, now),
      database.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").bind(CLASS_CODE_KEY, await hashSecret(classCode), now),
      database.prepare("INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)").bind(CLASS_CODE_DISPLAY_KEY, classCode, now),
      database.prepare(`INSERT INTO classes (id, name, code_hash, code_display, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)`).bind(classId, className, await hashSecret(classCode), classCode, now, now),
      database.prepare(`INSERT OR IGNORE INTO students
        (id, legal_name, normalized_name, nickname, auth_user_hash, auth_provider, auth_email, profile_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        crypto.randomUUID(), HOST_MEMBER_LABEL, "__host__", hostNickname(auth), auth.userHash, auth.provider, auth.email, auth.profileId, now, now,
      ),
      ...names.map((name) => database.prepare("INSERT INTO students (id, legal_name, normalized_name, class_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), name, normalizeName(name), classId, now, now)),
    ];
    await database.batch(statements);
    return Response.json(await rosterState(database, auth, classCode), { status: 201 });
  }

  if (body.action === "join") {
    const existing = await database.prepare("SELECT id FROM students WHERE auth_user_hash = ?").bind(auth.userHash).first();
    if (existing) return Response.json(await rosterState(database, auth));
    const nickname = String(body.nickname ?? "").trim().slice(0, 12);
    const classCode = String(body.classCode ?? "").trim();
    const classId = String(body.classId ?? "");
    if (!nickname || !profileIdPattern.test(classId)) throw new Error("invalid_roster");
    const selectedClass = await database.prepare("SELECT id, code_hash FROM classes WHERE id = ? AND is_active = 1")
      .bind(classId).first<Pick<ClassRow, "id" | "code_hash">>();
    if (!selectedClass) throw new Error("invalid_class");
    if (!selectedClass.code_hash || await hashSecret(classCode) !== selectedClass.code_hash) throw new Error("invalid_class_code");

    const now = Date.now();
    const legacyAccount = await database.prepare(`SELECT id, profile_id FROM students
      WHERE auth_user_hash IS NOT NULL AND auth_provider = 'chatgpt' AND class_id = ? AND nickname = ?
      ORDER BY updated_at DESC LIMIT 1`).bind(classId, nickname).first<Pick<StudentRow, "id" | "profile_id">>();
    if (legacyAccount) {
      const profileId = legacyAccount.profile_id || auth.profileId;
      const statements = [
        database.prepare(`UPDATE students SET legal_name = ?, normalized_name = ?, nickname = ?, auth_user_hash = ?,
          auth_provider = ?, auth_email = ?, profile_id = ?, updated_at = ? WHERE id = ?`)
          .bind(nickname, `account-${auth.userHash}`, nickname, auth.userHash, auth.provider, auth.email, profileId, now, legacyAccount.id),
      ];
      if (legacyAccount.profile_id) statements.push(database.prepare("UPDATE profiles SET owner_token_hash = ?, updated_at = ? WHERE id = ?")
        .bind(auth.userHash, now, legacyAccount.profile_id));
      await database.batch(statements);
      return Response.json(await rosterState(database, auth));
    }
    const reclaim = await database.prepare(`SELECT id, profile_id FROM students
      WHERE auth_user_hash IS NULL AND class_id = ? AND nickname = ? AND normalized_name LIKE 'reclaim-%'
      ORDER BY updated_at DESC LIMIT 1`).bind(classId, nickname).first<Pick<StudentRow, "id" | "profile_id">>();
    if (reclaim) {
      await database.prepare(`UPDATE students SET legal_name = ?, normalized_name = ?, nickname = ?, auth_user_hash = ?,
        auth_provider = ?, auth_email = ?, profile_id = ?, updated_at = ? WHERE id = ?`)
        .bind(nickname, `account-${auth.userHash}`, nickname, auth.userHash, auth.provider, auth.email, reclaim.profile_id || auth.profileId, now, reclaim.id).run();
    } else {
      await database.prepare(`INSERT INTO students
        (id, legal_name, normalized_name, nickname, auth_user_hash, auth_provider, auth_email, profile_id, class_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(crypto.randomUUID(), nickname, `account-${auth.userHash}`, nickname, auth.userHash, auth.provider, auth.email, auth.profileId, classId, now, now).run();
    }
    return Response.json(await rosterState(database, auth));
  }

  if (body.action === "claim") {
    const existing = await database.prepare("SELECT id FROM students WHERE auth_user_hash = ?").bind(auth.userHash).first();
    if (existing) return Response.json(await rosterState(database, auth));
    const codeHash = await setting(database, CLASS_CODE_KEY);
    const isAdmin = isDesignatedAdmin(auth);
    const classCode = String(body.classCode ?? "").trim();
    if (!isAdmin && (!codeHash || await hashSecret(classCode) !== codeHash)) throw new Error("invalid_class_code");
    const nickname = String(body.nickname ?? "").trim().slice(0, 12);
    const studentId = String(body.studentId ?? "");
    if (!nickname || !profileIdPattern.test(studentId)) throw new Error("invalid_roster");
    const selected = await database.prepare("SELECT profile_id FROM students WHERE id = ? AND auth_user_hash IS NULL AND normalized_name != '__host__'")
      .bind(studentId).first<Pick<StudentRow, "profile_id">>();
    if (!selected) throw new Error("student_already_claimed");
    const profileId = selected.profile_id || auth.profileId;
    const result = await database.prepare(`UPDATE students SET nickname = ?, auth_user_hash = ?, auth_provider = ?, auth_email = ?, profile_id = ?, updated_at = ?
      WHERE id = ? AND auth_user_hash IS NULL`).bind(nickname, auth.userHash, auth.provider, auth.email, profileId, Date.now(), studentId).run();
    if (!result.meta.changes) throw new Error("student_already_claimed");
    return Response.json(await rosterState(database, auth));
  }

  if (body.action === "add") {
    if (!isDesignatedAdmin(auth)) throw new Error("host_only");
    const existingResult = await database.prepare("SELECT normalized_name FROM students").all<{ normalized_name: string }>();
    const existing = new Set(existingResult.results.map((student) => student.normalized_name));
    const seen = new Set<string>();
    const names = (body.names ?? []).map((value) => String(value).trim().slice(0, 30)).filter((value) => {
      const normalized = normalizeName(value);
      if (!normalized || normalized === "__host__" || existing.has(normalized) || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
    if (!names.length) throw new Error("no_new_students");
    if (existing.size - 1 + names.length > 200) throw new Error("invalid_roster");
    const now = Date.now();
    await database.batch(names.map((name) => database.prepare(
      "INSERT INTO students (id, legal_name, normalized_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    ).bind(crypto.randomUUID(), name, normalizeName(name), now, now)));
    return Response.json(await rosterState(database, auth), { status: 201 });
  }

  if (body.action === "add_class") {
    if (!isDesignatedAdmin(auth)) throw new Error("host_only");
    const className = String(body.className ?? "").trim().slice(0, 20);
    const classCode = String(body.classCode ?? "").trim();
    if (!className || classCode.length < 4 || classCode.length > 20) throw new Error("invalid_roster");
    const now = Date.now();
    await database.prepare(`INSERT INTO classes
      (id, name, code_hash, code_display, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)`)
      .bind(crypto.randomUUID(), className, await hashSecret(classCode), classCode, now, now).run();
    return Response.json(await rosterState(database, auth), { status: 201 });
  }

  if (body.action === "set_class_code") {
    if (!isDesignatedAdmin(auth)) throw new Error("host_only");
    const classId = String(body.classId ?? "");
    const classCode = String(body.classCode ?? "").trim();
    if (!profileIdPattern.test(classId) || classCode.length < 4 || classCode.length > 20) throw new Error("invalid_class_code");
    const result = await database.prepare("UPDATE classes SET code_hash = ?, code_display = ?, updated_at = ? WHERE id = ? AND is_active = 1")
      .bind(await hashSecret(classCode), classCode, Date.now(), classId).run();
    if (!result.meta.changes) throw new Error("invalid_class");
    return Response.json(await rosterState(database, auth));
  }

  if (body.action === "set_code") {
    if (!isDesignatedAdmin(auth)) throw new Error("host_only");
    const classCode = String(body.classCode ?? "").trim();
    if (classCode.length < 4 || classCode.length > 20) throw new Error("invalid_class_code");
    const now = Date.now();
    await database.batch([
      database.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .bind(CLASS_CODE_KEY, await hashSecret(classCode), now),
      database.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .bind(CLASS_CODE_DISPLAY_KEY, classCode, now),
    ]);
    return Response.json(await rosterState(database, auth));
  }

  if (body.action === "reset_claim") {
    if (!isDesignatedAdmin(auth)) throw new Error("host_only");
    const studentId = String(body.studentId ?? "");
    if (!profileIdPattern.test(studentId)) throw new Error("invalid_roster");
    const student = await database.prepare("SELECT id, profile_id FROM students WHERE id = ? AND normalized_name != '__host__'")
      .bind(studentId).first<Pick<StudentRow, "id" | "profile_id">>();
    if (!student) throw new Error("invalid_roster");
    const statements = [
      database.prepare("UPDATE students SET auth_user_hash = NULL, auth_provider = 'none', auth_email = '', normalized_name = ?, updated_at = ? WHERE id = ?")
        .bind(`reclaim-${student.id}`, Date.now(), student.id),
    ];
    if (student.profile_id) statements.push(database.prepare("DELETE FROM presence WHERE profile_id = ?").bind(student.profile_id));
    await database.batch(statements);
    return Response.json(await rosterState(database, auth));
  }

  if (body.action === "remove") {
    if (!isDesignatedAdmin(auth)) throw new Error("host_only");
    const studentId = String(body.studentId ?? "");
    if (!profileIdPattern.test(studentId)) throw new Error("invalid_roster");
    const student = await database.prepare("SELECT id, profile_id FROM students WHERE id = ? AND normalized_name != '__host__'")
      .bind(studentId).first<Pick<StudentRow, "id" | "profile_id">>();
    if (!student) throw new Error("invalid_roster");
    const statements = [];
    if (student.profile_id) statements.push(database.prepare("DELETE FROM presence WHERE profile_id = ?").bind(student.profile_id));
    statements.push(database.prepare("DELETE FROM students WHERE id = ?").bind(student.id));
    await database.batch(statements);
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
  return Response.json({ profile: mapProfile(request, row, member.class_name), migrated: Boolean(existing) });
}

async function handleCommunity(request: Request, database: D1Database, member: Member) {
  if (request.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const [profile, activeResult, galleryResult, sessionsResult, teacherNote] = await Promise.all([
    database.prepare("SELECT id, name, nickname, character_preset, character_key, message FROM profiles WHERE id = ?").bind(member.profile_id).first<ProfileRow>(),
    database.prepare(`SELECT p.id, p.name, p.nickname, p.character_preset, p.character_key, p.message, pr.mode, pr.category, pr.started_at, c.name AS class_name
      FROM presence pr JOIN profiles p ON p.id = pr.profile_id
      LEFT JOIN students st ON st.profile_id = p.id LEFT JOIN classes c ON c.id = st.class_id
      WHERE pr.updated_at >= ? ORDER BY pr.mode DESC, pr.started_at ASC LIMIT 100`).bind(Date.now() - 90_000).all<PresenceRow>(),
    database.prepare(`SELECT s.id, s.profile_id, s.seconds, s.category, s.artwork_key, s.note, s.completed_at,
      COALESCE(NULLIF(p.nickname, ''), p.name) AS artist, p.character_key
      FROM work_sessions s JOIN profiles p ON p.id = s.profile_id
      WHERE s.gallery_hidden = 0 ORDER BY s.completed_at DESC LIMIT 40`).all<SessionRow>(),
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
    className: row.class_name || undefined,
  }));
  const gallery: SharedArtwork[] = galleryResult.results.map((row) => ({
    ...mapSession(request, row),
    artist: row.artist ?? "작업친구",
    artistProfileId: row.profile_id,
    artistCharacterDataUrl: mediaUrl(request, row.character_key),
  }));
  return Response.json({
    profile: profile ? mapProfile(request, profile, member.class_name) : null,
    active,
    gallery,
    sessions: sessionsResult.results.map((row) => mapSession(request, row)),
    teacherNote: teacherNote ?? "완성보다 시작이 중요해요. 이번 주도 가볍게 한 장 꺼내봐요.",
  }, { headers: { "cache-control": "no-store" } });
}

async function handleTeacherNote(request: Request, database: D1Database, auth: RequestUser) {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  if (!isDesignatedAdmin(auth)) return Response.json({ error: "host_only" }, { status: 403 });
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
  return Response.json({ profile: mapProfile(request, row, member.class_name) });
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

async function handleGallery(request: Request, database: D1Database, auth: RequestUser, member: Member) {
  if (request.method !== "DELETE") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const body = await request.json() as { sessionId?: string };
  const sessionId = String(body.sessionId ?? "");
  if (!profileIdPattern.test(sessionId)) throw new Error("artwork_not_found");
  const artwork = await database.prepare("SELECT profile_id FROM work_sessions WHERE id = ?")
    .bind(sessionId).first<{ profile_id: string }>();
  if (!artwork) throw new Error("artwork_not_found");
  if (artwork.profile_id !== member.profile_id && !isDesignatedAdmin(auth)) throw new Error("gallery_delete_forbidden");
  await database.prepare("UPDATE work_sessions SET gallery_hidden = 1 WHERE id = ?").bind(sessionId).run();
  return Response.json({ ok: true });
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
    const auth = await requireRequestUser(request, env.AUTH_SESSION_SECRET);
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/roster") return handleRoster(request, env.DB, auth);
    const member = await memberFor(env.DB, auth);
    if (pathname === "/api/profile") return handleProfile(request, env.DB, env.UPLOADS, auth, member);
    if (pathname === "/api/community") return handleCommunity(request, env.DB, member);
    if (pathname === "/api/presence") return handlePresence(request, env.DB, member);
    if (pathname === "/api/message") return handleMessage(request, env.DB, member);
    if (pathname === "/api/teacher-note") return handleTeacherNote(request, env.DB, auth);
    if (pathname === "/api/sessions") return handleSession(request, env.DB, env.UPLOADS, member);
    if (pathname === "/api/gallery") return handleGallery(request, env.DB, auth, member);
    if (pathname.startsWith("/api/media/")) return handleMedia(request, env.UPLOADS);
    return new Response("Not found", { status: 404 });
  } catch (error) {
    return errorResponse(error);
  }
}
