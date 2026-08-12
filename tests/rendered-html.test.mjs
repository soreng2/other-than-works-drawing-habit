import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const sessionSecret = "test-session-secret-that-is-more-than-32-characters";

function googleSessionCookie() {
  const payload = Buffer.from(JSON.stringify({
    provider: "google",
    sub: "test-google-user",
    email: "test@example.com",
    name: "테스트",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `otw_google_session=${encodeURIComponent(`${payload}.${signature}`)}`;
}

async function render(authenticated = false) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: {
        accept: "text/html",
        host: "localhost",
        ...(authenticated ? { cookie: googleSessionCookie() } : {}),
      },
    }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
      AUTH_SESSION_SECRET: sessionSecret,
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the stable account sign-in gate", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /OTHER THAN WORKS/);
  assert.match(html, /Google 계정으로 계속하기/);
  assert.match(html, /\/auth\/google\/start/);
  assert.match(html, /Google로 계속하기/);
  assert.match(html, /같은 캐릭터와 그림 기록/);
  assert.match(html, /manifest\.webmanifest/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/);
});

test("server-renders the studio loader for a signed-in account", async () => {
  const response = await render(true);
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /작업실 문을 여는 중/);
  assert.doesNotMatch(html, />ChatGPT로 로그인</);
});

test("starts a direct Google OAuth flow without a ChatGPT sign-in hop", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("google-auth-test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(new Request("https://other-than-works.test/auth/google/start"), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    GOOGLE_CLIENT_ID: "test-client.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    AUTH_SESSION_SECRET: sessionSecret,
  }, { waitUntil() {}, passThroughOnException() {} });
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.origin, "https://accounts.google.com");
  assert.equal(location.searchParams.get("redirect_uri"), "https://other-than-works.test/auth/google/callback");
  assert.equal(location.searchParams.get("scope"), "openid email profile");
  assert.match(response.headers.get("set-cookie") ?? "", /otw_google_oauth_state=/);
});

test("includes the complete shared MVP, roster, host controls and map assets", async () => {
  const [page, studio, layout, styles, manifest, serviceWorker, packageJson, communityClient, communityApi, requestAuth, googleSession, googleOauth, worker, hosting, migration, messageMigration, accountMigration, presetMigration, galleryMigration, classesMigration, googleAuthMigration] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/studio.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/community-client.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/api/community-api.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/auth/request-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/auth/google-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/server/auth/google-oauth.ts", import.meta.url), "utf8"),
    readFile(new URL("../worker/index.ts", import.meta.url), "utf8"),
    readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0000_shared_studio.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0001_profile_message.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0002_accounts_roster_map.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0003_character_presets.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0004_gallery_visibility.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0005_classes.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0006_google_auth.sql", import.meta.url), "utf8"),
  ]);

  assert.match(page, /hasGoogleSession/);
  assert.match(page, /googleSignInPath/);
  assert.doesNotMatch(page, /ChatGPTSignIn|chatGPTSignIn/);
  assert.match(studio, /visibilitychange/);
  assert.match(studio, /seconds: 300/);
  assert.match(studio, /자유 집중/);
  assert.match(studio, /timerTargets/);
  assert.match(studio, /지금부터 집중 시작!/);
  assert.match(studio, /onNavigate\("focus"\)/);
  assert.match(studio, /function FocusPanel/);
  assert.match(studio, /이번 집중에 할 일/);
  assert.match(studio, /otw-village\.png/);
  assert.match(studio, /focus-desk-front/);
  assert.match(studio, /focus-desk-front\.png/);
  assert.match(studio, /focus-ribbon\.png/);
  assert.match(styles, /\.focus-room-back[\s\S]*?z-index: 1/);
  assert.match(styles, /\.focus-chair[\s\S]*?z-index: 2/);
  assert.match(styles, /\.focus-character[\s\S]*?z-index: 3/);
  assert.match(styles, /\.focus-desk-front[\s\S]*?z-index: 4/);
  assert.match(studio, /validateCharacter/);
  assert.match(studio, /const sourceWidth =/);
  assert.match(studio, /character-image custom/);
  assert.match(studio, /PresetPicker/);
  assert.match(studio, /canvas\.toDataURL\("image\/png"\)/);
  assert.match(studio, /1024 × 1024px/);
  assert.match(studio, /IndexedDB|indexedDB/);
  assert.match(studio, /CompletionModal/);
  assert.match(studio, /TogetherPanel/);
  assert.match(studio, /RecordsPanel/);
  assert.match(studio, /records-management/);
  assert.match(studio, /\["records", roster\?\.isAdmin \? "기록·관리" : "기록"\]/);
  assert.match(studio, /GalleryPanel/);
  assert.match(studio, /galleryFrameSpots/);
  assert.match(studio, /surface: "partition"/);
  assert.match(studio, /GalleryArtwork/);
  assert.match(studio, /naturalWidth/);
  assert.match(studio, /GalleryVisitor/);
  assert.match(studio, /전시에서 내리기/);
  assert.match(studio, /MissionPanel/);
  assert.match(layout, /og\.jpg/);
  assert.match(styles, /prefers-reduced-motion/);
  assert.match(manifest, /"display": "standalone"/);
  assert.match(serviceWorker, /caches\.open/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(communityClient, /fetchCommunity/);
  assert.match(communityClient, /updatePresence/);
  assert.match(communityClient, /saveCloudSession/);
  assert.match(communityClient, /updateSharedMessage/);
  assert.match(communityClient, /setupRoster/);
  assert.match(communityClient, /claimRoster/);
  assert.match(communityClient, /updateTeacherNote/);
  assert.match(communityClient, /addRosterStudents/);
  assert.match(communityClient, /removeRosterStudent/);
  assert.match(communityClient, /updateClassCode/);
  assert.match(communityClient, /removeGalleryArtwork/);
  assert.match(communityApi, /admin_user_hash/);
  assert.match(communityApi, /mon\.mut\.friends@gmail\.com/);
  assert.match(communityApi, /action === "add"/);
  assert.match(communityApi, /action === "remove"/);
  assert.match(communityApi, /action === "set_code"/);
  assert.match(communityApi, /class_code_display/);
  assert.match(communityApi, /ensureAdminMember/);
  assert.match(communityApi, /INSERT OR IGNORE INTO students/);
  assert.match(communityApi, /student_already_claimed/);
  assert.match(communityApi, /teacher_note/);
  assert.match(requestAuth, /googleSessionFromRequest/);
  assert.match(requestAuth, /google:\$\{session\.sub\}/);
  assert.match(requestAuth, /oai-authenticated-user-id/);
  assert.match(googleOauth, /signin-with-chatgpt/);
  assert.match(googleSession, /HttpOnly; SameSite=Lax/);
  assert.match(googleSession, /HMAC/);
  assert.match(googleOauth, /accounts\.google\.com\/o\/oauth2\/v2\/auth/);
  assert.match(googleOauth, /oauth2\.googleapis\.com\/token/);
  assert.match(googleOauth, /openidconnect\.googleapis\.com\/v1\/userinfo/);
  assert.match(studio, /href="\/auth\/logout"/);
  assert.doesNotMatch(studio, /signout-with-chatgpt/);
  assert.match(worker, /handleCommunityApi/);
  assert.match(hosting, /"d1": "DB"/);
  assert.match(hosting, /"r2": "UPLOADS"/);
  assert.match(migration, /CREATE TABLE `profiles`/);
  assert.match(migration, /CREATE TABLE `presence`/);
  assert.match(migration, /CREATE TABLE `work_sessions`/);
  assert.match(messageMigration, /ADD `message`/);
  assert.match(accountMigration, /CREATE TABLE `students`/);
  assert.match(accountMigration, /CREATE TABLE `app_settings`/);
  assert.match(presetMigration, /character_preset/);
  assert.match(galleryMigration, /gallery_hidden/);
  assert.match(classesMigration, /CREATE TABLE `classes`/);
  assert.match(classesMigration, /ADD `class_id`/);
  assert.match(googleAuthMigration, /auth_provider/);
  assert.match(googleAuthMigration, /auth_email/);
  assert.match(communityApi, /auth_provider = 'chatgpt'/);
  assert.match(communityApi, /UPDATE profiles SET owner_token_hash/);
  assert.match(communityApi, /WHERE s\.gallery_hidden = 0/);
  assert.match(communityApi, /UPDATE work_sessions SET gallery_hidden = 1/);
  assert.match(styles, /preset-grid/);
  assert.match(styles, /studio-room\.jpg/);
  assert.match(styles, /shared-lounge\.png/);
  assert.match(styles, /gallery-room-2f\.png/);
  assert.match(styles, /\.gallery-frame-art img[\s\S]*?object-fit: contain/);
  assert.match(styles, /timer-presets/);
  assert.match(styles, /\.focus-page/);
  assert.match(studio, /예시 캐릭터/);
  assert.match(studio, /첫 반 만들고 내 작업실 열기/);
  assert.match(studio, /반과 닉네임만/);
  assert.match(studio, /class-choice-grid/);
  assert.match(communityClient, /joinRosterClass/);
  assert.match(communityClient, /createRosterClass/);
  assert.match(communityApi, /action === "join"/);
  assert.match(communityApi, /action === "add_class"/);
  assert.match(studio, /together-map/);
  assert.match(studio, /SharedMap/);
  assert.match(studio, /mapSpots/);
  assert.doesNotMatch(studio, /mapAreaLabels/);
  assert.match(studio, /floating-name/);
  assert.match(studio, /map-chair/);
  assert.match(styles, /@keyframes map-stroll/);
  assert.match(styles, /aspect-ratio: 1/);
  assert.match(styles, /\.together-map \.map-friend\.mine::after \{ content: none; \}/);
  assert.match(styles, /\.together-map \.floating-name[\s\S]*?animation: none;/);
  assert.match(styles, /\.together-map \.floating-name b[\s\S]*?text-overflow: ellipsis;/);
  assert.match(styles, /\.together-map \.map-avatar \.character-image\.custom/);
  assert.match(styles, /\.gallery-visitor > span b[\s\S]*?text-overflow: ellipsis;/);
  assert.match(styles, /\.gallery-visitor \.character-image\.custom/);
  assert.match(styles, /@media \(min-width: 700px\)/);
  assert.match(studio, /내 캐릭터 위 메시지/);
  assert.match(studio, /한마디 수정/);
  assert.match(studio, /선생님 계정 전용/);
  assert.match(studio, /반 · 수강생 관리/);
  assert.match(studio, /새 반 만들기/);
  assert.doesNotMatch(studio, /function MapZone/);
  assert.doesNotMatch(studio, /옆으로 넘기면/);
  assert.doesNotMatch(studio, /desk-tablet|아이패드 책상/);
  assert.doesNotMatch(studio, /friendSeed|gallerySeed/);

  await access(new URL("../public/brand-character.png", import.meta.url));
  await access(new URL("../public/studio-room.jpg", import.meta.url));
  await access(new URL("../public/shared-studio.jpg", import.meta.url));
  await access(new URL("../public/shared-lounge.png", import.meta.url));
  await access(new URL("../public/gallery-room.png", import.meta.url));
  await access(new URL("../public/gallery-room-2f.png", import.meta.url));
  await access(new URL("../public/gallery-folder-statue.png", import.meta.url));
  await access(new URL("../public/focus-room-backdrop.png", import.meta.url));
  await access(new URL("../public/focus-chair.png", import.meta.url));
  await access(new URL("../public/focus-desk-front.png", import.meta.url));
  await access(new URL("../public/focus-ribbon.png", import.meta.url));
  for (const color of ["blue", "green", "orange", "pink", "purple", "yellow"]) {
    await access(new URL(`../public/folder-${color}.png`, import.meta.url));
  }
  await access(new URL("../public/og.jpg", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await access(new URL(".openai/hosting.json", root));
});
